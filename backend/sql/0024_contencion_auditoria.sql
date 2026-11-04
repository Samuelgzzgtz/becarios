-- 0024: Contención de autorregistros y límites de escritura en la API.
begin;
alter table public.asistencias drop constraint asistencias_motivo_revision_check;
alter table public.asistencias add constraint asistencias_motivo_revision_check
  check (motivo_revision in ('atraso_cola', 'reloj_adelantado', 'sin_ubicacion', 'fuera_de_zona',
                             'sin_rostro', 'modalidad_distinta', 'revision_humana'));

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
  -- Sin usuario (service role, jobs): no se toca nada.
  if v_uid is null then
    return new;
  end if;

  -- Lo que mande el cliente en estas columnas se ignora.
  new.origen := 'en_linea';
  new.revision := 'ok';
  new.motivo_revision := null;

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

-- Igual que en 0021, con el detalle de los dos motivos nuevos.
create or replace function public.anomalias_asistencia(
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
  detalle        text
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

  v_desde := coalesce(p_desde, public.hoy_local() - 30);
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
      lead(a.id)          over w as sig_id,
      lead(a.tipo)        over w as sig_tipo,
      lead(a.ocurrido_en) over w as sig_en,
      lead(a.revision)    over w as sig_revision,
      lead(a.origen)      over w as sig_origen
    from public.asistencias a
    join visibles v on v.id = a.becario_id
    where (a.ocurrido_en at time zone 'America/Monterrey')::date between v_desde and v_hasta
    window w as (partition by a.becario_id order by a.ocurrido_en)
  ),
  filas as (
    -- Entrada sin salida el mismo día local.
    select 'turno_abierto'::text as tipo, e.becario_id, e.nombre as becario_nombre,
           e.id as asistencia_id, null::uuid as entrada_id, e.ocurrido_en, e.dia as fecha,
           case when e.dia = public.hoy_local()
                then round((extract(epoch from (now() - e.ocurrido_en)) / 3600.0)::numeric, 2) end as horas,
           null::integer as atraso_minutos,
           case when e.dia = public.hoy_local()
                then 'Entrada sin salida; lleva más de ' || trim(to_char(v_tope, 'FM990.9')) || ' horas abierta.'
                else 'Entrada sin salida el mismo día.' end as detalle
    from ev e
    where e.tipo = 'entrada'
      and e.revision <> 'aprobada'
      and not coalesce(
            e.sig_tipo = 'salida'
            and (e.sig_en at time zone 'America/Monterrey')::date = e.dia,
            false)
      and (e.dia < public.hoy_local()
           or (e.dia = public.hoy_local()
               and extract(epoch from (now() - e.ocurrido_en)) / 3600.0 > v_tope))

    union all
    -- Jornada que pasa el tope sin salida aprobada ni manual.
    select 'jornada_larga', e.becario_id, e.nombre,
           e.sig_id, e.id, e.sig_en, (e.sig_en at time zone 'America/Monterrey')::date,
           round((extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0)::numeric, 2),
           null::integer,
           'Jornada de ' || trim(to_char(extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0, 'FM990.9'))
             || ' horas; pasa el tope de ' || trim(to_char(v_tope, 'FM990.9')) || ' y no suma hasta aprobarla.'
    from ev e
    where e.tipo = 'entrada'
      and e.sig_tipo = 'salida'
      and (e.sig_en at time zone 'America/Monterrey')::date = e.dia
      and extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0 > v_tope
      and e.sig_revision <> 'aprobada'
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
         f.fecha, f.horas, f.atraso_minutos, f.detalle
  from filas f
  order by f.fecha desc, f.becario_nombre, f.ocurrido_en desc;
end;
$$;


-- Una baja administrativa local es independiente de Ban/Unban en Clerk.
alter table public.usuarios add column estado_local public.estado_usuario;
-- No hay fuente para distinguir bajas históricas de bloqueos de Clerk.
-- Se conserva todo estado no activo hasta una reactivación administrativa explícita.
update public.usuarios set estado_local = estado where estado <> 'activo';
comment on column public.usuarios.estado_local is 'Baja local explícita o estado no activo previo a 0024; null deja que Clerk gobierne el acceso.';
create function public.conservar_estado_local()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if public.es_admin() and new.estado is distinct from old.estado then
    new.estado_local := case when new.estado = 'activo' then null else new.estado end;
  elsif current_user in ('anon', 'authenticated') and new.estado_local is distinct from old.estado_local then
    raise exception 'El estado local solo cambia al dar de baja o reactivar una cuenta.';
  end if;
  return new;
end;
$$;
revoke execute on function public.conservar_estado_local() from public, anon, authenticated;
create trigger usuarios_estado_local before update on public.usuarios
  for each row execute function public.conservar_estado_local();

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
        nombre = coalesce(nullif(trim(p_nombre), ''), u.nombre),
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


create or replace function public.cambiar_estado_usuario(p_usuario uuid, p_estado public.estado_usuario)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  u public.usuarios;
  v_becarios integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar el estado de una cuenta.';
  end if;
  if p_usuario = (select public.uid_actual()) then
    raise exception 'No puedes cambiar el estado de tu propia cuenta.';
  end if;

  select * into u from public.usuarios where id = p_usuario for update;
  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if u.perfil = 'ingeniero' and p_estado <> 'activo' then
    select count(*) into v_becarios
    from public.ingenieros_becarios ib
    join public.usuarios b on b.id = ib.becario_id and b.estado = 'activo'
    where ib.ingeniero_id = p_usuario and ib.activo;
    if v_becarios > 0 then
      raise exception 'Este ingeniero tiene % becario(s) asignado(s); reasígnalos antes de darlo de baja.', v_becarios;
    end if;
  end if;

  update public.usuarios set estado = p_estado,
    estado_local = case when p_estado = 'activo' then null else p_estado end
  where id = p_usuario;

  if p_estado <> 'activo' then
    update public.transferencias
    set estado = 'rechazada', resuelta_por = (select public.uid_actual())
    where estado = 'pendiente'
      and (becario_id = p_usuario or ingeniero_destino = p_usuario or ingeniero_origen = p_usuario);
  end if;
end;
$$;

-- Las resoluciones se hacen en resolver_transferencia, nunca por escritura directa.
drop policy transferencias_insert on public.transferencias;
create policy transferencias_insert on public.transferencias for insert to authenticated
with check (
  estado = 'pendiente' and resuelta_por is null
  and ((ingeniero_origen = (select public.uid_actual()) and public.es_ingeniero_de(becario_id)) or public.es_admin())
);
drop policy transferencias_update_admin on public.transferencias;

-- Objetos inmutables: cada reemplazo se sube con nombre nuevo. Así una firma
-- concurrente no puede terminar apuntando a bytes reemplazados posteriormente.
drop policy siase_update on storage.objects;
create function public.validar_archivo_siase()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- No bloquea firmas de reportes históricos; valida cada archivo nuevo o cambiado.
  if tg_op = 'UPDATE' and new.archivo_url is not distinct from old.archivo_url
     and new.becario_id = old.becario_id and new.mes = old.mes
     and not (new.estado = 'confirmado' and old.estado <> 'confirmado') then
    return new;
  end if;
  if new.archivo_url is null and new.estado <> 'subido' then
    return new;
  end if;
  if new.archivo_url is null
     or new.archivo_url !~ ('^' || new.becario_id::text || '/' || new.mes::text || '/[A-Za-z0-9_][A-Za-z0-9._-]*$') then
    raise exception 'El archivo debe pertenecer al becario y mes del reporte.';
  end if;
  perform 1 from storage.objects where bucket_id = 'siase' and name = new.archivo_url for share;
  if not found then
    raise exception 'El archivo del reporte no existe en Storage.';
  end if;
  return new;
end;
$$;
revoke execute on function public.validar_archivo_siase() from public, anon, authenticated;
create trigger reportes_validar_archivo before insert or update on public.reportes_siase
  for each row execute function public.validar_archivo_siase();
commit;
