-- 0022: Solicitudes de corrección de asistencias y auditoría inmutable.
--
--  * El becario activo pide agregar, modificar o eliminar un registro suyo
--    (solicitar_correccion_asistencia). Su ingeniero asignado o un admin la
--    resuelve (resolver_correccion_asistencia).
--  * El ingeniero asignado o el admin corrigen directo con motivo
--    (corregir_asistencia). Ya no pueden escribir en asistencias por la API.
--  * Toda inserción, modificación o borrado de asistencias (registro automático,
--    corrección, cascada, service_role) queda en bitacora_asistencias, que no se
--    puede editar ni borrar y no tiene llaves foráneas: sobrevive al borrado del
--    registro o del usuario.
--
-- Errores: raise exception P0001 en español. HINT para que el cliente distinga:
-- solicitud_duplicada, solicitud_resuelta, solicitud_obsoleta y el
-- asistencia_duplicada de 0013 (ahora también al modificar).

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
begin;

create table public.solicitudes_correccion (
  id            uuid primary key default gen_random_uuid(),
  becario_id    uuid not null references public.usuarios (id) on delete cascade,
  accion        text not null check (accion in ('agregar', 'modificar', 'eliminar')),
  -- Sin llave foránea: la asistencia puede borrarse y la solicitud se conserva.
  asistencia_id uuid,
  -- La fila de asistencias tal como estaba al pedir; aprobar exige que siga igual.
  antes         jsonb,
  -- Valores finales propuestos (agregar/modificar); null al eliminar.
  tipo          public.tipo_asistencia,
  ocurrido_en   timestamptz,
  modalidad     public.modalidad_trabajo,
  motivo        text not null check (char_length(btrim(motivo)) between 1 and 500),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  created_at    timestamptz not null default now(),
  -- Sin llave foránea, igual que la auditoría: es historia, no relación viva.
  resuelto_por  uuid,
  resuelto_en   timestamptz,
  respuesta     text check (char_length(btrim(respuesta)) between 1 and 500),
  constraint solicitudes_correccion_forma check (
    case accion
      when 'agregar' then asistencia_id is null and antes is null
        and tipo is not null and ocurrido_en is not null and modalidad is not null
      when 'modificar' then asistencia_id is not null and antes is not null
        and tipo is not null and ocurrido_en is not null and modalidad is not null
      else asistencia_id is not null and antes is not null
        and tipo is null and ocurrido_en is null and modalidad is null
    end
  ),
  constraint solicitudes_correccion_resolucion check (
    (estado = 'pendiente') = (resuelto_en is null and respuesta is null)
  )
);

create index solicitudes_correccion_becario_idx
  on public.solicitudes_correccion (becario_id, created_at desc);

-- Una sola solicitud pendiente por registro, y por registro propuesto al agregar.
create unique index solicitudes_correccion_asistencia_pendiente_idx
  on public.solicitudes_correccion (asistencia_id) where estado = 'pendiente';
create unique index solicitudes_correccion_agregar_pendiente_idx
  on public.solicitudes_correccion (becario_id, tipo, ocurrido_en)
  where estado = 'pendiente' and accion = 'agregar';

-- Extend the existing ledger, preserving its IDs and prior events.
alter table public.bitacora_asistencias
  add column actor_nombre text,
  add column motivo text,
  add column solicitud_id uuid;
update public.bitacora_asistencias b set actor_nombre = u.nombre
from public.usuarios u where u.id = b.hecho_por;
create index bitacora_asistencias_asistencia_idx on public.bitacora_asistencias(asistencia_id);
create index bitacora_asistencias_hecho_en_idx on public.bitacora_asistencias(hecho_en desc, id);

-- ---------------------------------------------------------------------------
-- Lectura: el becario activo lo suyo, el ingeniero asignado su equipo, el admin
-- todo. Nadie escribe por la API: solo las RPC y el trigger (SECURITY DEFINER).
-- ---------------------------------------------------------------------------
alter table public.solicitudes_correccion enable row level security;
alter table public.bitacora_asistencias enable row level security;

revoke all on public.solicitudes_correccion from public, anon, authenticated, service_role;
revoke all on public.bitacora_asistencias from public, anon, authenticated, service_role;
grant select on public.solicitudes_correccion to authenticated, service_role;
grant select on public.bitacora_asistencias to authenticated, service_role;

-- Mismo criterio que es_ingeniero_de, pero se evalúa una vez por consulta y no por
-- fila: la bitácora crece con cada marcación y el historial no debe escanearla entera.
create or replace function public.becarios_a_cargo()
returns setof uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select ib.becario_id from public.ingenieros_becarios ib
  join public.usuarios u on u.id = ib.ingeniero_id
  where ib.ingeniero_id = (select public.uid_actual()) and ib.activo
    and u.estado = 'activo' and u.perfil = 'ingeniero';
$$;
revoke execute on function public.becarios_a_cargo() from public, anon;
grant execute on function public.becarios_a_cargo() to authenticated;

create policy solicitudes_correccion_select on public.solicitudes_correccion
  for select to authenticated
  using (
    (select public.es_admin())
    or (becario_id = (select public.uid_actual()) and (select public.usuario_activo()))
    or becario_id in (select public.becarios_a_cargo())
  );

drop policy bitacora_asistencias_select on public.bitacora_asistencias;
create policy bitacora_asistencias_select on public.bitacora_asistencias
  for select to authenticated
  using (
    (select public.es_admin())
    or (becario_id = (select public.uid_actual()) and (select public.usuario_activo()))
    or becario_id in (select public.becarios_a_cargo())
  );

-- Append-only incluso para service_role y el dueño (salvo desactivar el trigger).
create or replace function public.auditoria_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'La auditoría de asistencias no se puede modificar ni borrar.';
end;
$$;

create trigger bitacora_asistencias_inmutable
  before update or delete on public.bitacora_asistencias
  for each row execute function public.auditoria_inmutable();
create trigger bitacora_asistencias_sin_truncate
  before truncate on public.bitacora_asistencias
  for each statement execute function public.auditoria_inmutable();

-- ---------------------------------------------------------------------------
-- Auditoría automática de asistencias. Las RPC de corrección dejan el motivo y
-- la solicitud en variables de la transacción; el registro automático no.
-- TimeZone fijo: el jsonb de las fechas debe ser comparable entre sesiones.
-- ---------------------------------------------------------------------------
create or replace function public.asistencias_bitacora()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set timezone to 'UTC'
as $$
declare
  v_actor uuid := public.uid_actual();
  v_fila public.asistencias;
begin
  if tg_op = 'DELETE' then
    v_fila := old;
  else
    v_fila := new;
  end if;

  insert into public.bitacora_asistencias
    (becario_id, asistencia_id, accion, hecho_por, actor_nombre, antes, despues, motivo, solicitud_id)
  values (
    v_fila.becario_id,
    v_fila.id,
    case tg_op when 'INSERT' then 'agregar' when 'UPDATE' then
      case when old.revision <> 'aprobada' and new.revision = 'aprobada'
        and (to_jsonb(new) - 'revision') = (to_jsonb(old) - 'revision')
        then 'aprobar' else 'editar' end else 'eliminar' end,
    v_actor,
    (select u.nombre from public.usuarios u where u.id = v_actor),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    nullif(current_setting('docencheck.correccion_motivo', true), ''),
    nullif(current_setting('docencheck.correccion_solicitud', true), '')::uuid
  );
  return null;
end;
$$;

drop trigger asistencias_bitacora on public.asistencias;
create trigger asistencias_bitacora
  after insert or update or delete on public.asistencias
  for each row execute function public.asistencias_bitacora();

-- ---------------------------------------------------------------------------
-- Escritura directa en asistencias: solo el propio registro del usuario, sin
-- verificado_por. Las correcciones pasan por las RPC, que son SECURITY DEFINER y
-- corren como el dueño, igual que service_role y las migraciones: esos no son
-- 'authenticated'/'anon' y este trigger los deja pasar.
-- ---------------------------------------------------------------------------
drop policy asistencias_insert on public.asistencias;
drop policy asistencias_update on public.asistencias;
drop policy asistencias_delete on public.asistencias;

create policy asistencias_insert on public.asistencias
  for insert to authenticated
  with check (
    becario_id = (select public.uid_actual())
    and public.usuario_activo()
    and verificado_por is null
  );

revoke update, delete, truncate on public.asistencias from anon, authenticated;

create or replace function public.proteger_asistencias()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' and new.becario_id = public.uid_actual() and new.verificado_por is null then
    -- Recepción real en servidor, aunque el teléfono sincronice una fecha pasada.
    new.created_at := clock_timestamp();
    return new;
  end if;
  raise exception 'Las correcciones de asistencia se hacen con motivo desde la pantalla de corrección.';
end;
$$;

create trigger asistencias_proteger
  before insert or update or delete on public.asistencias
  for each row execute function public.proteger_asistencias();

-- El anti-duplicado de 0013 también aplica cuando una corrección mueve la hora.
drop trigger asistencias_validar on public.asistencias;
create trigger asistencias_validar
  before insert or update of becario_id, ocurrido_en on public.asistencias
  for each row execute function public.validar_asistencia();

-- ---------------------------------------------------------------------------
-- Internas (sin EXECUTE para la API; las llaman las RPC como dueño).
-- ---------------------------------------------------------------------------

/*
 * Valida una corrección y devuelve los valores finales. Al modificar, null en
 * tipo/ocurrido_en/modalidad conserva el valor actual. Bloquea la asistencia.
 */
create or replace function public._preparar_correccion(
  p_becario uuid,
  p_accion text,
  p_asistencia uuid,
  p_tipo public.tipo_asistencia,
  p_ocurrido_en timestamptz,
  p_modalidad public.modalidad_trabajo,
  p_motivo text,
  p_antes jsonb,
  out v_antes jsonb,
  out v_tipo public.tipo_asistencia,
  out v_ocurrido_en timestamptz,
  out v_modalidad public.modalidad_trabajo,
  out v_motivo text
)
language plpgsql
set search_path = public, pg_temp
set timezone to 'UTC'
as $$
declare
  a public.asistencias;
begin
  v_motivo := nullif(btrim(p_motivo), '');
  if v_motivo is null or char_length(v_motivo) > 500 then
    raise exception 'Escribe el motivo (máximo 500 caracteres).';
  end if;

  if p_accion = 'agregar' then
    if p_asistencia is not null or p_tipo is null or p_ocurrido_en is null or p_modalidad is null then
      raise exception 'Para agregar un registro indica tipo, fecha y hora, y modalidad.';
    end if;
    v_tipo := p_tipo;
    v_ocurrido_en := p_ocurrido_en;
    v_modalidad := p_modalidad;
  elsif p_accion in ('modificar', 'eliminar') then
    select * into a from public.asistencias
    where id = p_asistencia and becario_id = p_becario
    for update;
    if not found then
      raise exception 'El registro de asistencia no existe.';
    end if;
    v_antes := to_jsonb(a);
    -- Revisar una marcación no cambia la fecha/tipo/modalidad que vio el solicitante.
    if p_antes is not null and jsonb_populate_record(null::public.asistencias,
      p_antes || jsonb_build_object('revision', a.revision, 'motivo_revision', a.motivo_revision)) is distinct from a then
      raise exception 'El registro cambió desde que lo abriste. Vuelve a seleccionarlo antes de corregirlo.'
        using hint = 'solicitud_obsoleta';
    end if;
    if p_accion = 'modificar' then
      v_tipo := coalesce(p_tipo, a.tipo);
      v_ocurrido_en := coalesce(p_ocurrido_en, a.ocurrido_en);
      v_modalidad := coalesce(p_modalidad, a.modalidad);
      if (v_tipo, v_ocurrido_en, v_modalidad) = (a.tipo, a.ocurrido_en, a.modalidad) then
        raise exception 'La corrección no cambia nada del registro.';
      end if;
    end if;
  else
    raise exception 'La acción debe ser agregar, modificar o eliminar.';
  end if;

  if v_ocurrido_en > now() then
    raise exception 'La fecha y hora no puede estar en el futuro.';
  end if;
end;
$$;

/* Aplica una corrección ya validada; el trigger de auditoría recoge motivo y solicitud. */
create or replace function public._aplicar_correccion(
  p_becario uuid,
  p_accion text,
  p_asistencia uuid,
  p_tipo public.tipo_asistencia,
  p_ocurrido_en timestamptz,
  p_modalidad public.modalidad_trabajo,
  p_motivo text,
  p_solicitud uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform set_config('docencheck.correccion_motivo', p_motivo, true);
  perform set_config('docencheck.correccion_solicitud', coalesce(p_solicitud::text, ''), true);

  if p_accion = 'agregar' then
    insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad, verificado_por)
    values (p_becario, p_tipo, p_ocurrido_en, p_modalidad, public.uid_actual());
  elsif p_accion = 'modificar' then
    update public.asistencias
    set tipo = p_tipo, ocurrido_en = p_ocurrido_en, modalidad = p_modalidad,
        verificado_por = public.uid_actual(), origen = 'manual', revision = 'aprobada', motivo_revision = null
    where id = p_asistencia;
  else
    delete from public.asistencias where id = p_asistencia;
  end if;

  perform set_config('docencheck.correccion_motivo', '', true);
  perform set_config('docencheck.correccion_solicitud', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

/* El becario activo pide corregir un registro suyo. Devuelve el id de la solicitud. */
create or replace function public.solicitar_correccion_asistencia(
  p_accion text,
  p_asistencia uuid default null,
  p_tipo public.tipo_asistencia default null,
  p_ocurrido_en timestamptz default null,
  p_modalidad public.modalidad_trabajo default null,
  p_motivo text default null,
  p_antes jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set timezone to 'UTC'
as $$
declare
  v_uid uuid := public.uid_actual();
  c record;
  v_id uuid;
begin
  if not exists (
    select 1 from public.usuarios u
    where u.id = v_uid and u.perfil = 'becario' and u.estado = 'activo'
  ) then
    raise exception 'Solo un becario activo puede solicitar correcciones.';
  end if;

  -- Serializa las solicitudes del becario: el tope y los duplicados se cuentan bien.
  perform pg_advisory_xact_lock(hashtextextended('solicitudes_correccion:' || v_uid, 0));

  select * into c
  from public._preparar_correccion(v_uid, p_accion, p_asistencia, p_tipo, p_ocurrido_en, p_modalidad, p_motivo, p_antes);

  if (select count(*) from public.solicitudes_correccion
      where becario_id = v_uid and estado = 'pendiente') >= 20 then
    raise exception 'Tienes 20 solicitudes pendientes; espera a que se resuelvan.';
  end if;

  begin
    insert into public.solicitudes_correccion
      (becario_id, accion, asistencia_id, antes, tipo, ocurrido_en, modalidad, motivo)
    values (v_uid, p_accion, p_asistencia, c.v_antes, c.v_tipo, c.v_ocurrido_en, c.v_modalidad, c.v_motivo)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya hay una solicitud pendiente para ese registro.' using hint = 'solicitud_duplicada';
  end;

  return v_id;
end;
$$;

/*
 * El ingeniero asignado o un admin aprueba o rechaza. El candado de la solicitud
 * impide resolverla dos veces; aprobar exige que el registro siga como al pedirlo.
 */
create or replace function public.resolver_correccion_asistencia(
  p_solicitud uuid,
  p_aprobar boolean,
  p_respuesta text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set timezone to 'UTC'
as $$
declare
  s public.solicitudes_correccion;
  a public.asistencias;
  v_respuesta text := nullif(btrim(p_respuesta), '');
begin
  if p_aprobar is null then
    raise exception 'Indica si apruebas o rechazas la solicitud.';
  end if;
  if v_respuesta is null or char_length(v_respuesta) > 500 then
    raise exception 'Escribe una respuesta (máximo 500 caracteres).';
  end if;

  select * into s from public.solicitudes_correccion where id = p_solicitud for update;
  if not found or not (public.es_ingeniero_de(s.becario_id) or public.es_admin()) then
    raise exception 'La solicitud no existe o no puedes resolverla.';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue resuelta.' using hint = 'solicitud_resuelta';
  end if;

  if p_aprobar then
    if s.accion <> 'agregar' then
      select * into a from public.asistencias where id = s.asistencia_id for update;
      if not found or (to_jsonb(a) - 'revision' - 'motivo_revision') <> (s.antes - 'revision' - 'motivo_revision') then
        raise exception 'El registro cambió o se borró desde que se pidió la corrección; recházala.'
          using hint = 'solicitud_obsoleta';
      end if;
    end if;
    perform public._aplicar_correccion(
      s.becario_id, s.accion, s.asistencia_id, s.tipo, s.ocurrido_en, s.modalidad, s.motivo, s.id
    );
  end if;

  update public.solicitudes_correccion
  set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
      resuelto_por = public.uid_actual(),
      resuelto_en = now(),
      respuesta = v_respuesta
  where id = s.id;
end;
$$;

/* Corrección directa del ingeniero asignado o del admin. El motivo es obligatorio. */
create or replace function public.corregir_asistencia(
  p_becario uuid,
  p_accion text,
  p_asistencia uuid,
  p_tipo public.tipo_asistencia,
  p_ocurrido_en timestamptz,
  p_modalidad public.modalidad_trabajo,
  p_motivo text,
  p_antes jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set timezone to 'UTC'
as $$
declare
  c record;
begin
  if not (public.es_ingeniero_de(p_becario) or public.es_admin())
     or not exists (select 1 from public.usuarios u where u.id = p_becario and u.perfil = 'becario') then
    raise exception 'No puedes corregir las asistencias de este becario.';
  end if;

  select * into c
  from public._preparar_correccion(p_becario, p_accion, p_asistencia, p_tipo, p_ocurrido_en, p_modalidad, p_motivo, p_antes);

  perform public._aplicar_correccion(
    p_becario, p_accion, p_asistencia, c.v_tipo, c.v_ocurrido_en, c.v_modalidad, c.v_motivo, null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios. Supabase concede EXECUTE a anon/authenticated por defecto.
-- ---------------------------------------------------------------------------
revoke execute on function public.auditoria_inmutable() from public, anon, authenticated;
revoke execute on function public.asistencias_bitacora() from public, anon, authenticated;
revoke execute on function public.proteger_asistencias() from public, anon, authenticated;
revoke execute on function public._preparar_correccion(uuid, text, uuid, public.tipo_asistencia, timestamptz, public.modalidad_trabajo, text, jsonb) from public, anon, authenticated;
revoke execute on function public._aplicar_correccion(uuid, text, uuid, public.tipo_asistencia, timestamptz, public.modalidad_trabajo, text, uuid) from public, anon, authenticated;

revoke execute on function public.solicitar_correccion_asistencia(text, uuid, public.tipo_asistencia, timestamptz, public.modalidad_trabajo, text, jsonb) from public, anon;
revoke execute on function public.resolver_correccion_asistencia(uuid, boolean, text) from public, anon;
revoke execute on function public.corregir_asistencia(uuid, text, uuid, public.tipo_asistencia, timestamptz, public.modalidad_trabajo, text, jsonb) from public, anon;
grant execute on function public.solicitar_correccion_asistencia(text, uuid, public.tipo_asistencia, timestamptz, public.modalidad_trabajo, text, jsonb) to authenticated;
grant execute on function public.resolver_correccion_asistencia(uuid, boolean, text) to authenticated;
grant execute on function public.corregir_asistencia(uuid, text, uuid, public.tipo_asistencia, timestamptz, public.modalidad_trabajo, text, jsonb) to authenticated;

commit;
