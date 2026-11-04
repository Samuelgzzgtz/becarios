-- 0025: Revisión humana usable, jornadas largas con confirmación propia,
-- reintentos sin duplicados y RLS más barata.
--
--  1. asistencias.jornada_aprobada: aprobar la revisión de una salida ya no
--     levanta el tope de jornada; solo lo hace confirmar la jornada larga.
--  2. horas_trabajadas usa jornada_aprobada; horas_por_aprobar suma los pares
--     que todavía esperan revisión, con las mismas reglas.
--  3. anomalias_asistencia: evidencia por registro, filtro por índice, desde el
--     inicio del periodo activo y el turno sin salida no se oculta al aprobar
--     la entrada. contar_anomalias_asistencia para los paneles.
--  4. aprobar_asistencia(p_asistencia, p_jornada) y aprobar_asistencias (lote).
--  5. exportar_asistencias con revisión, motivo y origen, y cursor opcional.
--  6. vista_previa_cierre avisa cuántos registros siguen por revisar.
--  7. Disparadores de confianza: solo sin JWT o con service_role, nunca con un
--     JWT de anon/authenticated sin usuario.
--  8. sincronizar_usuario_clerk ya no reemplaza el nombre de una cuenta existente.
--  9. SIASE: solo PDF, PNG o JPEG.
-- 10. Políticas RLS de asistencias, usuarios, reportes_siase y horarios con
--     funciones evaluadas una vez por consulta.
--
-- Aditiva para la web y la app Android en producción: las RPC conservan sus
-- parámetros (los nuevos tienen valor por omisión) y solo agregan columnas.
-- Sin backfill de jornada_aprobada: ver backend/sql/README.md.
begin;

-- ---------------------------------------------------------------------------
-- 1) Jornada larga confirmada aparte
-- ---------------------------------------------------------------------------
alter table public.asistencias add column jornada_aprobada boolean not null default false;
comment on column public.asistencias.jornada_aprobada is
  'Salida cuya jornada pasa el tope y fue confirmada (aprobar_asistencia con p_jornada). Aprobar la revisión no la confirma.';

-- Orden de exportar_asistencias (cursor por ocurrido_en, id).
create index asistencias_ocurrido_id_idx on public.asistencias (ocurrido_en, id);

-- ---------------------------------------------------------------------------
-- 2) Horas
-- ---------------------------------------------------------------------------

/*
 * Pares entrada → salida inmediata siguiente del mismo día local que pueden
 * sumar: dentro del tope, o con salida manual o jornada confirmada. [pendiente]
 * indica que alguno de los dos sigue por revisar. Corre con los permisos de
 * quien llama (RLS), igual que horas_trabajadas.
 */
create function public._pares_horas(p_becario uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (entrada timestamptz, horas numeric, pendiente boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  with cfg as (
    select coalesce((select c.jornada_maxima_horas from public.config_asistencia c limit 1), 10) as tope
  ),
  eventos as (
    select
      a.tipo,
      a.ocurrido_en,
      a.revision,
      lead(a.ocurrido_en)      over w as siguiente,
      lead(a.tipo)             over w as tipo_siguiente,
      lead(a.revision)         over w as revision_siguiente,
      lead(a.origen)           over w as origen_siguiente,
      lead(a.jornada_aprobada) over w as jornada_siguiente
    from public.asistencias a
    where a.becario_id = p_becario
      and a.ocurrido_en >= p_desde
      and a.ocurrido_en <  p_hasta
    window w as (order by a.ocurrido_en)
  )
  select
    e.ocurrido_en,
    (extract(epoch from (e.siguiente - e.ocurrido_en)) / 3600.0)::numeric,
    e.revision = 'por_revisar' or e.revision_siguiente = 'por_revisar'
  from eventos e
  cross join cfg
  where e.tipo = 'entrada'
    and e.tipo_siguiente = 'salida'
    and (e.ocurrido_en at time zone 'America/Monterrey')::date
      = (e.siguiente   at time zone 'America/Monterrey')::date
    and (
      extract(epoch from (e.siguiente - e.ocurrido_en)) / 3600.0 <= cfg.tope
      or e.jornada_siguiente
      or e.origen_siguiente = 'manual'
    );
$$;

-- Misma firma y reglas de 0021, salvo que el tope solo lo levanta una jornada confirmada.
create or replace function public.horas_trabajadas(
  p_becario uuid,
  p_desde   timestamptz,
  p_hasta   timestamptz
)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select round(coalesce(sum(p.horas), 0), 2)
  from public._pares_horas(p_becario, p_desde, p_hasta) p
  where not p.pendiente;
$$;

-- Horas que sumarán al aprobarse, en las mismas ventanas que progreso_horas.
create function public.horas_por_aprobar(p_becario uuid)
returns table (horas_semana numeric, horas_mes numeric, horas_semestre numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  with periodo as (
    select p.fecha_inicio, p.fecha_fin from public.periodos_academicos p where p.activo limit 1
  ),
  r as (
    select
      date_trunc('week',  l.ahora) at time zone 'America/Monterrey' as semana,
      date_trunc('month', l.ahora) at time zone 'America/Monterrey' as mes,
      coalesce(public.inicio_dia_local((select fecha_inicio from periodo)),
               date_trunc('year', l.ahora) at time zone 'America/Monterrey') as semestre,
      least(now(), coalesce(public.inicio_dia_local((select fecha_fin from periodo) + 1), now())) as fin_semestre
    from (select now() at time zone 'America/Monterrey' as ahora) l
  )
  -- Una sola lectura: los pares nunca cruzan medianoche y las ventanas empiezan en un día local.
  select
    round(coalesce(sum(p.horas) filter (where p.entrada >= r.semana), 0), 2),
    round(coalesce(sum(p.horas) filter (where p.entrada >= r.mes), 0), 2),
    round(coalesce(sum(p.horas) filter (where p.entrada >= r.semestre and p.entrada < r.fin_semestre), 0), 2)
  from r
  left join public._pares_horas(p_becario, least(r.semana, r.mes, r.semestre), now()) p on p.pendiente
  group by r.semana, r.mes, r.semestre, r.fin_semestre;
$$;

revoke execute on function public._pares_horas(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.horas_por_aprobar(uuid) from public, anon;
-- horas_trabajadas es SECURITY INVOKER y la llama la API: necesita EXECUTE en _pares_horas (RLS sigue aplicando).
grant execute on function public._pares_horas(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.horas_por_aprobar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Disparador del servidor: ignora jornada_aprobada del cliente y solo
--    confía en llamadas sin JWT (dueño, jobs) o con service_role.
-- ---------------------------------------------------------------------------
create or replace function public.asistencias_servidor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := (select public.uid_actual());
  v_tope_min   integer;
  v_atraso_max integer;
  v_atraso     interval;
  v_tol        interval;
  v_modalidad  public.modalidad_trabajo;
begin
  -- Dueño, jobs o service_role: no se toca nada. Un JWT de la API sin usuario
  -- de Clerk (p. ej. uno heredado de Supabase Auth) no es de confianza.
  if coalesce((select auth.jwt()) ->> 'role', '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if v_uid is null then
    raise exception 'Inicia sesión para registrar asistencia.';
  end if;

  -- Lo que mande el cliente en estas columnas se ignora.
  new.origen := 'en_linea';
  new.revision := 'ok';
  new.motivo_revision := null;
  new.jornada_aprobada := false;

  -- Lo agrega otra persona (ingeniero/administrador): de confianza.
  if v_uid <> new.becario_id then
    new.origen := 'manual';
    return new;
  end if;

  select c.tolerancia_minutos, c.atraso_maximo_minutos
    into v_tope_min, v_atraso_max
  from public.config_asistencia c
  limit 1;
  v_tope_min := coalesce(v_tope_min, 5);
  v_atraso_max := coalesce(v_atraso_max, 60);

  v_tol := make_interval(mins => v_tope_min);
  v_atraso := now() - new.ocurrido_en;

  if v_atraso < -v_tol then
    -- Hora futura: reloj del teléfono adelantado. Se usa la hora del servidor.
    new.ocurrido_en := now();
    new.revision := 'por_revisar';
    new.motivo_revision := 'reloj_adelantado';
  elsif v_atraso > v_tol then
    new.origen := 'cola';
    if v_atraso > make_interval(mins => v_atraso_max) then
      new.revision := 'por_revisar';
      new.motivo_revision := 'atraso_cola';
    end if;
  end if;

  -- Modalidad esperada: la del horario para el día local del registro. Sin
  -- horario ese día es presencial, igual que la app (modalidadDeHoy).
  select h.modalidad into v_modalidad
  from public.horarios_modalidad h
  where h.becario_id = new.becario_id
    and h.dia_semana = extract(dow from new.ocurrido_en at time zone 'America/Monterrey');
  v_modalidad := coalesce(v_modalidad, 'presencial');

  -- La app siempre verifica el rostro antes de registrar; sin puntaje no hubo verificación.
  if new.revision = 'ok' and new.puntaje_rostro is null then
    new.revision := 'por_revisar';
    new.motivo_revision := 'sin_rostro';
  elsif new.revision = 'ok' and new.modalidad <> v_modalidad then
    new.revision := 'por_revisar';
    new.motivo_revision := 'modalidad_distinta';
  end if;

  -- Geocerca: solo si hay zonas activas, es presencial y todavía está ok.
  if new.revision = 'ok'
     and new.modalidad = 'presencial'
     and exists (select 1 from public.geocercas g where g.activa) then
    if new.latitud is null or new.longitud is null then
      new.revision := 'por_revisar';
      new.motivo_revision := 'sin_ubicacion';
    elsif not exists (
      select 1 from public.geocercas g
      where g.activa
        and public._distancia_m(
              new.latitud::double precision, new.longitud::double precision,
              g.latitud::double precision, g.longitud::double precision
            ) <= g.radio_m
    ) then
      new.revision := 'por_revisar';
      new.motivo_revision := 'fuera_de_zona';
    end if;
  end if;

  if new.revision = 'ok' then
    new.revision := 'por_revisar';
    new.motivo_revision := 'revision_humana';
  end if;

  return new;
end;
$$;

revoke execute on function public.asistencias_servidor() from public, anon, authenticated;

-- Igual que 0014/0023, con el mismo criterio de confianza que asistencias_servidor.
create or replace function public.proteger_reporte_siase()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_abierta boolean;
begin
  if coalesce((select auth.jwt()) ->> 'role', '') not in ('authenticated', 'anon')
     or public.es_admin()
     or public.es_ingeniero_de(new.becario_id) then
    return new;
  end if;

  if not public.usuario_activo() then
    raise exception 'Tu cuenta está inactiva; no puedes subir reportes.';
  end if;

  if new.estado not in ('pendiente', 'subido')
     or new.firmado_por is not null
     or new.fecha_firma is not null then
    raise exception 'Solo tu ingeniero o la coordinación pueden confirmar un reporte.';
  end if;

  if tg_op = 'UPDATE' then
    if old.estado not in ('pendiente', 'subido') then
      raise exception 'Este reporte ya fue revisado; ya no se puede reemplazar.';
    end if;
    if new.becario_id <> old.becario_id or new.mes <> old.mes or new.periodo_id <> old.periodo_id then
      raise exception 'No se puede cambiar el mes ni el periodo de un reporte.';
    end if;
  end if;

  select e.abierta into v_abierta from public.estado_ventana_siase(public.hoy_local()) e;
  if not coalesce(v_abierta, false)
     or new.mes <> date_trunc('month', public.hoy_local())::date then
    raise exception 'La ventana para subir el reporte SIASE está cerrada.';
  end if;

  return new;
end;
$$;

revoke execute on function public.proteger_reporte_siase() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Bitácora y correcciones: jornada_aprobada cuenta como aprobación y, igual
--    que revision, no vuelve obsoleta una solicitud ni la foto "antes" anterior
--    a esta migración (que no trae la columna).
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
      case when (to_jsonb(new) - 'revision' - 'jornada_aprobada') = (to_jsonb(old) - 'revision' - 'jornada_aprobada')
        and ((old.revision <> 'aprobada' and new.revision = 'aprobada')
             or (new.jornada_aprobada and not old.jornada_aprobada))
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

revoke execute on function public.asistencias_bitacora() from public, anon, authenticated;

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
      p_antes || jsonb_build_object('revision', a.revision, 'motivo_revision', a.motivo_revision,
                                    'jornada_aprobada', a.jornada_aprobada)) is distinct from a then
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

revoke execute on function public._preparar_correccion(uuid, text, uuid, public.tipo_asistencia, timestamptz, public.modalidad_trabajo, text, jsonb) from public, anon, authenticated;

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
      if not found or (to_jsonb(a) - 'revision' - 'motivo_revision' - 'jornada_aprobada')
                      <> (s.antes - 'revision' - 'motivo_revision' - 'jornada_aprobada') then
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

-- ---------------------------------------------------------------------------
-- 5) Aprobación: individual (con confirmación de jornada aparte) y por lote.
--    Mismo permiso en ambas: ingeniero asignado activo o administrador, nunca
--    sobre registros propios.
-- ---------------------------------------------------------------------------
drop function public.aprobar_asistencia(uuid);
create function public.aprobar_asistencia(p_asistencia uuid, p_jornada boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.asistencias;
begin
  select * into a from public.asistencias where id = p_asistencia for update;
  if not found then
    raise exception 'El registro de asistencia no existe.';
  end if;
  if a.becario_id = (select public.uid_actual())
     or not (public.es_admin() or public.es_ingeniero_de(a.becario_id)) then
    raise exception 'Solo el ingeniero asignado o un administrador puede aprobar este registro.';
  end if;
  if p_jornada and a.tipo <> 'salida' then
    raise exception 'La jornada se confirma en su salida.';
  end if;
  update public.asistencias
  set revision = 'aprobada', jornada_aprobada = jornada_aprobada or coalesce(p_jornada, false)
  where id = p_asistencia
    and (revision <> 'aprobada' or (coalesce(p_jornada, false) and not jornada_aprobada));
end;
$$;

-- Aprueba la revisión de varios registros; no confirma jornadas largas. Los que
-- ya no existen se omiten. Devuelve cuántos cambiaron.
create function public.aprobar_asistencias(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select public.uid_actual());
  v_admin boolean := public.es_admin();
  v_n integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'Aprueba a lo más 1000 registros a la vez.';
  end if;
  perform 1 from public.asistencias a where a.id = any(p_ids) for update;
  if exists (
    select 1 from public.asistencias a
    where a.id = any(p_ids)
      and (a.becario_id is not distinct from v_uid
           or not (v_admin or a.becario_id in (select public.becarios_a_cargo())))
  ) then
    raise exception 'Solo el ingeniero asignado o un administrador puede aprobar estos registros.';
  end if;
  update public.asistencias set revision = 'aprobada'
  where id = any(p_ids) and revision <> 'aprobada';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.aprobar_asistencia(uuid, boolean) from public, anon;
revoke execute on function public.aprobar_asistencias(uuid[]) from public, anon;
grant execute on function public.aprobar_asistencia(uuid, boolean) to authenticated;
grant execute on function public.aprobar_asistencias(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Registros por revisar con evidencia
-- ---------------------------------------------------------------------------
drop function public.anomalias_asistencia(uuid, date, date);
create function public.anomalias_asistencia(
  p_becario uuid default null,
  p_desde   date default null,
  p_hasta   date default null
)
returns table (
  tipo           text,
  becario_id     uuid,
  becario_nombre text,
  asistencia_id  uuid,
  entrada_id     uuid,
  ocurrido_en    timestamptz,
  fecha          date,
  horas          numeric,
  atraso_minutos integer,
  detalle        text,
  -- Evidencia del registro asistencia_id.
  puntaje_rostro numeric,
  -- Metros fuera de la zona activa más cercana (0 = dentro); null sin ubicación o sin zonas.
  distancia_m    integer,
  origen         text,
  -- Minutos entre la hora del registro y su llegada al servidor.
  subido_minutos integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid    uuid := (select public.uid_actual());
  v_perfil public.perfil_usuario;
  v_estado public.estado_usuario;
  v_desde  date;
  v_hasta  date;
  v_tope   numeric;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para ver los registros por revisar.';
  end if;
  select u.perfil, u.estado into v_perfil, v_estado from public.usuarios u where u.id = v_uid;
  if v_estado is distinct from 'activo' then
    raise exception 'Tu cuenta no está activa.';
  end if;

  -- Por omisión desde el inicio del periodo activo: lo pendiente no desaparece a los 30 días.
  v_desde := coalesce(
    p_desde,
    (select p.fecha_inicio from public.periodos_academicos p where p.activo limit 1),
    public.hoy_local() - 30
  );
  v_hasta := coalesce(p_hasta, public.hoy_local());
  select coalesce((select c.jornada_maxima_horas from public.config_asistencia c limit 1), 10) into v_tope;

  if p_becario is not null and not exists (
    select 1 from public.usuarios u
    where u.id = p_becario and u.perfil = 'becario' and u.estado = 'activo'
      and (v_perfil = 'administrador'
           or (v_perfil = 'ingeniero' and public.es_ingeniero_de(u.id))
           or u.id = v_uid)
  ) then
    raise exception 'No tienes acceso a los registros de ese becario.';
  end if;

  return query
  with visibles as (
    select u.id, u.nombre
    from public.usuarios u
    where u.perfil = 'becario'
      and u.estado = 'activo'
      and (p_becario is null or u.id = p_becario)
      and (v_perfil = 'administrador'
           or (v_perfil = 'ingeniero' and public.es_ingeniero_de(u.id))
           or u.id = v_uid)
  ),
  ev as (
    select
      a.id, a.becario_id, v.nombre, a.tipo, a.ocurrido_en, a.revision, a.origen,
      a.motivo_revision, a.created_at,
      (a.ocurrido_en at time zone 'America/Monterrey')::date as dia,
      lead(a.id)               over w as sig_id,
      lead(a.tipo)             over w as sig_tipo,
      lead(a.ocurrido_en)      over w as sig_en,
      lead(a.origen)           over w as sig_origen,
      lead(a.jornada_aprobada) over w as sig_jornada
    from public.asistencias a
    join visibles v on v.id = a.becario_id
    where a.ocurrido_en >= public.inicio_dia_local(v_desde)
      and a.ocurrido_en <  public.inicio_dia_local(v_hasta + 1)
    window w as (partition by a.becario_id order by a.ocurrido_en)
  ),
  filas as (
    -- Entrada sin salida el mismo día local, aunque la entrada ya esté aprobada.
    select 'turno_abierto'::text as tipo, e.becario_id, e.nombre as becario_nombre,
           e.id as asistencia_id, null::uuid as entrada_id, e.ocurrido_en, e.dia as fecha,
           case when e.dia = public.hoy_local()
                then round((extract(epoch from (now() - e.ocurrido_en)) / 3600.0)::numeric, 2) end as horas,
           null::integer as atraso_minutos,
           case when e.dia = public.hoy_local()
                then 'Entrada sin salida; lleva más de ' || rtrim(to_char(v_tope, 'FM990.9'), '.') || ' horas abierta.'
                else 'Entrada sin salida el mismo día.' end as detalle
    from ev e
    where e.tipo = 'entrada'
      and not coalesce(
            e.sig_tipo = 'salida'
            and (e.sig_en at time zone 'America/Monterrey')::date = e.dia,
            false)
      and (e.dia < public.hoy_local()
           or (e.dia = public.hoy_local()
               and extract(epoch from (now() - e.ocurrido_en)) / 3600.0 > v_tope))

    union all
    -- Jornada que pasa el tope sin confirmar ni salida manual.
    select 'jornada_larga', e.becario_id, e.nombre,
           e.sig_id, e.id, e.sig_en, (e.sig_en at time zone 'America/Monterrey')::date,
           round((extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0)::numeric, 2),
           null::integer,
           'Jornada de ' || rtrim(to_char(extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0, 'FM990.9'), '.')
             || ' horas; pasa el tope de ' || rtrim(to_char(v_tope, 'FM990.9'), '.') || ' y no suma hasta confirmarla.'
    from ev e
    where e.tipo = 'entrada'
      and e.sig_tipo = 'salida'
      and (e.sig_en at time zone 'America/Monterrey')::date = e.dia
      and extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0 > v_tope
      and not e.sig_jornada
      and e.sig_origen <> 'manual'

    union all
    -- Registros marcados por el servidor.
    select case e.motivo_revision when 'atraso_cola' then 'atraso' else e.motivo_revision end,
           e.becario_id, e.nombre, e.id, null::uuid, e.ocurrido_en, e.dia, null::numeric,
           case when e.motivo_revision = 'atraso_cola'
                then floor(extract(epoch from (e.created_at - e.ocurrido_en)) / 60.0)::integer end,
           case e.motivo_revision
             when 'atraso_cola' then 'Registro enviado con mucho atraso (sin red); no suma hasta aprobarlo.'
             when 'reloj_adelantado' then 'El reloj del teléfono estaba adelantado; se usó la hora del servidor.'
             when 'sin_ubicacion' then 'Registro presencial sin ubicación.'
             when 'revision_humana' then 'Autorregistro pendiente de revisión humana; la coincidencia facial del cliente no acredita identidad.'
             when 'sin_rostro' then 'Registro sin verificación facial.'
             when 'modalidad_distinta' then 'La modalidad no coincide con el horario de ese día.'
             else 'Registro presencial fuera de las zonas permitidas.'
           end
    from ev e
    where e.revision = 'por_revisar'
      and e.motivo_revision is not null
  )
  select f.tipo, f.becario_id, f.becario_nombre, f.asistencia_id, f.entrada_id, f.ocurrido_en,
         f.fecha, f.horas, f.atraso_minutos, f.detalle,
         a.puntaje_rostro,
         (select round(min(greatest(0, public._distancia_m(
                    a.latitud::double precision, a.longitud::double precision,
                    g.latitud::double precision, g.longitud::double precision) - g.radio_m)))::integer
          from public.geocercas g
          where g.activa and a.latitud is not null and a.longitud is not null),
         a.origen,
         greatest(0, floor(extract(epoch from (a.created_at - a.ocurrido_en)) / 60.0))::integer
  from filas f
  join public.asistencias a on a.id = f.asistencia_id
  order by f.fecha desc, f.becario_nombre, f.ocurrido_en desc;
end;
$$;

-- Solo el total, para los paneles: evita traer la lista completa.
create function public.contar_anomalias_asistencia(
  p_becario uuid default null,
  p_desde   date default null,
  p_hasta   date default null
)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.anomalias_asistencia(p_becario, p_desde, p_hasta);
$$;

revoke execute on function public.anomalias_asistencia(uuid, date, date) from public, anon;
revoke execute on function public.contar_anomalias_asistencia(uuid, date, date) from public, anon;
grant execute on function public.anomalias_asistencia(uuid, date, date) to authenticated;
grant execute on function public.contar_anomalias_asistencia(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Exportación: revisión, motivo y origen; cursor opcional (ocurrido_en, id).
--    p_offset sigue funcionando para la web y la app Android anteriores.
-- ---------------------------------------------------------------------------
drop function public.exportar_asistencias(date, date, integer, integer);
create function public.exportar_asistencias(
  p_desde       date,
  p_hasta       date,
  p_offset      integer default 0,
  p_limite      integer default 1000,
  p_despues_en  timestamptz default null,
  p_despues_id  uuid default null
)
returns table (
  id              uuid,
  matricula       text,
  nombre          text,
  tipo            text,
  modalidad       text,
  fecha           text,
  hora            text,
  ocurrido_en     timestamptz,
  revision        text,
  motivo_revision text,
  origen          text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede exportar asistencias.';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha final no puede ser anterior a la inicial.';
  end if;

  return query
  select
    a.id,
    u.matricula,
    u.nombre,
    a.tipo::text,
    a.modalidad::text,
    to_char(a.ocurrido_en at time zone 'America/Monterrey', 'YYYY-MM-DD'),
    to_char(a.ocurrido_en at time zone 'America/Monterrey', 'HH24:MI'),
    a.ocurrido_en,
    a.revision,
    a.motivo_revision,
    a.origen
  from public.asistencias a
  join public.usuarios u on u.id = a.becario_id
  where a.ocurrido_en >= public.inicio_dia_local(p_desde)
    and a.ocurrido_en <  public.inicio_dia_local(p_hasta + 1)
    and (p_despues_en is null or (a.ocurrido_en, a.id) > (p_despues_en, p_despues_id))
  order by a.ocurrido_en, a.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limite, 1), 1000);
end;
$$;

revoke execute on function public.exportar_asistencias(date, date, integer, integer, timestamptz, uuid) from public, anon;
grant execute on function public.exportar_asistencias(date, date, integer, integer, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Vista previa del cierre: registros que siguen por revisar en el periodo.
-- ---------------------------------------------------------------------------
drop function public.vista_previa_cierre();
create function public.vista_previa_cierre()
returns table (
  periodo_id            uuid,
  nombre                text,
  fecha_inicio          date,
  fecha_fin             date,
  becarios_activos      integer,
  becarios_cumplidos    integer,
  registros_por_revisar integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p public.periodos_academicos;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede ver el cierre del semestre.';
  end if;
  select * into p from public.periodos_academicos pa where pa.activo limit 1;
  if not found then
    return;
  end if;
  return query
    select p.id, p.nombre, p.fecha_inicio, p.fecha_fin, c.becarios_activos, c.becarios_cumplidos,
      (select count(*)::integer
       from public.asistencias a
       join public.usuarios u on u.id = a.becario_id and u.perfil = 'becario' and u.estado = 'activo'
       where a.revision = 'por_revisar'
         and a.ocurrido_en >= public.inicio_dia_local(p.fecha_inicio)
         and a.ocurrido_en <  public.inicio_dia_local(p.fecha_fin + 1))
    from public._cumplimiento_periodo(p.fecha_inicio, p.fecha_fin) c;
end;
$$;

revoke execute on function public.vista_previa_cierre() from public, anon;
grant execute on function public.vista_previa_cierre() to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Clerk: el nombre se toma al crear la cuenta. Después solo se reemplaza el
--    provisional (parte local del correo o el id de Clerk); el usuario puede
--    editar su nombre en Clerk y no debe cambiar el de la app.
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_usuario_clerk(
  p_clerk_id text,
  p_email text,
  p_nombre text,
  p_perfil text,
  p_matricula text,
  p_coordinacion text,
  p_bloqueado boolean,
  p_estado text default null,
  p_actualizado_en bigint default 0,
  p_correo_verificado boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_perfil public.perfil_usuario;
  v_estado public.estado_usuario;
  v_email text := case when p_correo_verificado then nullif(lower(trim(p_email)), '') end;
begin
  -- La fila serializa entregas concurrentes; un evento viejo no restaura acceso.
  insert into public.clerk_sincronizacion as actual (clerk_id, actualizado_en, eliminado)
  values (p_clerk_id, p_actualizado_en, false)
  on conflict (clerk_id) do update set actualizado_en = excluded.actualizado_en
  where not actual.eliminado and actual.actualizado_en < excluded.actualizado_en;
  if not found then
    select id into v_id from public.usuarios where clerk_id = p_clerk_id;
    return v_id;
  end if;

  begin
    v_perfil := nullif(trim(p_perfil), '')::public.perfil_usuario;
  exception when invalid_text_representation then
    v_perfil := null;
  end;

  select id into v_id from public.usuarios where clerk_id = p_clerk_id;
  if v_id is null and v_email is not null then
    select id into v_id from public.usuarios where lower(email) = v_email and clerk_id is null;
  end if;

  -- Correo sin verificar que coincide con una cuenta sin enlazar: no se crea un
  -- duplicado; se enlaza cuando llegue el evento con el correo verificado.
  if v_id is null and not p_correo_verificado and exists (
    select 1 from public.usuarios
    where lower(email) = nullif(lower(trim(p_email)), '') and clerk_id is null
  ) then
    return null;
  end if;

  if v_id is null then
    v_estado := case
      when p_bloqueado or v_perfil is null then 'inactivo'
      when p_estado = 'egresado' then 'egresado'
      else 'activo'
    end;
    insert into public.usuarios (clerk_id, email, nombre, matricula, perfil, coordinacion, estado)
    values (
      p_clerk_id,
      v_email,
      coalesce(nullif(trim(p_nombre), ''), split_part(coalesce(v_email, p_clerk_id), '@', 1)),
      coalesce(nullif(trim(p_matricula), ''), p_clerk_id),
      coalesce(v_perfil, 'becario'),
      nullif(trim(p_coordinacion), ''),
      v_estado
    )
    returning id into v_id;
  else
    update public.usuarios u
    set clerk_id = p_clerk_id,
        email = coalesce(v_email, u.email),
        nombre = case
          when u.nombre in (split_part(coalesce(u.email, u.clerk_id, p_clerk_id), '@', 1), p_clerk_id)
          then coalesce(nullif(trim(p_nombre), ''), u.nombre)
          else u.nombre
        end,
        matricula = coalesce(nullif(trim(p_matricula), ''), u.matricula),
        coordinacion = coalesce(nullif(trim(p_coordinacion), ''), u.coordinacion),
        perfil = coalesce(v_perfil, u.perfil),
        estado = case
          when p_bloqueado then 'inactivo'::public.estado_usuario
          when u.estado_local is not null then u.estado_local
          when p_estado = 'egresado' then 'egresado'::public.estado_usuario
          -- Recibió perfil (acceso) o se desbloqueó: vuelve a estar activo.
          when v_perfil is not null then 'activo'::public.estado_usuario
          else u.estado
        end
    where u.id = v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text, bigint, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 10) SIASE: sin SVG ni otros tipos que el navegador pueda ejecutar.
-- ---------------------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg']
where id = 'siase';

-- ---------------------------------------------------------------------------
-- 11) RLS: mismas reglas, con funciones envueltas en (select ...) para que se
--     evalúen una vez por consulta y no por fila. becarios_a_cargo() equivale
--     a es_ingeniero_de() fila por fila. Los índices de los predicados ya
--     existen: (becario_id, ...) en cada tabla e ingenieros_becarios(ingeniero_id).
-- ---------------------------------------------------------------------------
drop policy asistencias_select on public.asistencias;
create policy asistencias_select on public.asistencias for select to authenticated
using (
  (select public.es_admin())
  or becario_id = (select public.uid_actual())
  or becario_id in (select public.becarios_a_cargo())
);

drop policy asistencias_insert on public.asistencias;
create policy asistencias_insert on public.asistencias for insert to authenticated
with check (
  becario_id = (select public.uid_actual())
  and (select public.usuario_activo())
  and verificado_por is null
);

drop policy reportes_select on public.reportes_siase;
create policy reportes_select on public.reportes_siase for select to authenticated
using (
  (select public.es_admin())
  or becario_id = (select public.uid_actual())
  or becario_id in (select public.becarios_a_cargo())
);

drop policy horarios_select on public.horarios_modalidad;
drop policy horarios_insert on public.horarios_modalidad;
drop policy horarios_update on public.horarios_modalidad;
drop policy horarios_delete on public.horarios_modalidad;
create policy horarios_select on public.horarios_modalidad for select to authenticated
using (
  (select public.es_admin())
  or becario_id = (select public.uid_actual())
  or becario_id in (select public.becarios_a_cargo())
);
create policy horarios_insert on public.horarios_modalidad for insert to authenticated
with check ((select public.es_admin()) or becario_id in (select public.becarios_a_cargo()));
create policy horarios_update on public.horarios_modalidad for update to authenticated
using ((select public.es_admin()) or becario_id in (select public.becarios_a_cargo()))
with check ((select public.es_admin()) or becario_id in (select public.becarios_a_cargo()));
create policy horarios_delete on public.horarios_modalidad for delete to authenticated
using ((select public.es_admin()) or becario_id in (select public.becarios_a_cargo()));

-- usuarios: el becario ve a su ingeniero vigente (antes es_mi_ingeniero por fila).
drop policy usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select to authenticated
using (
  (select public.es_admin())
  or id = (select public.uid_actual())
  or id in (select public.becarios_a_cargo())
  or (perfil = 'ingeniero'
      and (select public.perfil_actual()) = 'ingeniero'
      and (select public.usuario_activo()))
  or (perfil = 'ingeniero'
      and id in (select ib.ingeniero_id from public.ingenieros_becarios ib
                 where ib.becario_id = (select public.uid_actual()) and ib.activo))
);

drop policy usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update to authenticated
using ((id = (select public.uid_actual()) and (select public.usuario_activo())) or (select public.es_admin()))
with check ((id = (select public.uid_actual()) and (select public.usuario_activo())) or (select public.es_admin()));

commit;
