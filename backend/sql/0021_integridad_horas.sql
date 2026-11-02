-- 0021 — Integridad de horas y asistencias.
-- Contrato: docs/integridad-horas.md. Migración aditiva e idempotente (se puede
-- correr dos veces) y compatible con la app en producción, que manda
-- ocurrido_en con la hora del teléfono y no manda origen/revision.
--
--  1. asistencias: origen, revision, motivo_revision, puntaje_rostro.
--  2. config_asistencia (tope de jornada, atraso máximo, tolerancia) y geocercas.
--  3. Trigger BEFORE INSERT que calcula origen/revision/motivo en el servidor
--     (se ordena antes de asistencias_validar por su nombre).
--  4. horas_trabajadas con las reglas de revisión y tope (misma firma).
--  5. bitacora_asistencias: rastro de altas manuales, ediciones, borrados y
--     aprobaciones.
--  6. RPC: anomalias_asistencia, aprobar_asistencia, bitacora_asistencias_de,
--     guardar_config_asistencia, guardar_geocerca, eliminar_geocerca.
--
-- Identidad: public.uid_actual() (Clerk), nunca auth.uid().

-- ---------------------------------------------------------------------------
-- 1) Columnas nuevas de asistencias
-- ---------------------------------------------------------------------------
alter table public.asistencias
  add column if not exists origen text not null default 'en_linea'
    check (origen in ('en_linea', 'cola', 'manual')),
  add column if not exists revision text not null default 'ok'
    check (revision in ('ok', 'por_revisar', 'aprobada')),
  add column if not exists motivo_revision text
    check (motivo_revision in ('atraso_cola', 'reloj_adelantado', 'sin_ubicacion', 'fuera_de_zona')),
  add column if not exists puntaje_rostro numeric(5, 4)
    check (puntaje_rostro between 0 and 1);

create index if not exists asistencias_por_revisar_idx
  on public.asistencias (becario_id, ocurrido_en)
  where revision = 'por_revisar';

-- ---------------------------------------------------------------------------
-- 2) Configuración y geocercas
-- ---------------------------------------------------------------------------
create table if not exists public.config_asistencia (
  id                    boolean primary key default true check (id), -- fila única
  jornada_maxima_horas  numeric(4, 1) not null default 10
    check (jornada_maxima_horas between 1 and 24),
  atraso_maximo_minutos integer not null default 60
    check (atraso_maximo_minutos between 1 and 1440),
  tolerancia_minutos    integer not null default 5
    check (tolerancia_minutos between 1 and 60),
  updated_at            timestamptz not null default now()
);

insert into public.config_asistencia (id, jornada_maxima_horas, atraso_maximo_minutos, tolerancia_minutos)
values (true, 10, 60, 5)
on conflict (id) do nothing;

create table if not exists public.geocercas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(btrim(nombre)) > 0),
  latitud    numeric(9, 6) not null check (latitud between -90 and 90),
  longitud   numeric(9, 6) not null check (longitud between -180 and 180),
  radio_m    integer not null default 150 check (radio_m between 20 and 5000),
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bitacora_asistencias (
  id            bigint generated always as identity primary key,
  asistencia_id uuid not null, -- sin FK: sobrevive al borrado del registro
  becario_id    uuid not null,
  accion        text not null check (accion in ('agregar', 'editar', 'eliminar', 'aprobar')),
  hecho_por     uuid,
  hecho_en      timestamptz not null default now(),
  antes         jsonb,
  despues       jsonb
);

create index if not exists bitacora_asistencias_becario_idx
  on public.bitacora_asistencias (becario_id, hecho_en desc);

-- ---------------------------------------------------------------------------
-- Distancia en metros entre dos puntos (haversine, SQL puro, sin PostGIS).
-- ---------------------------------------------------------------------------
create or replace function public._distancia_m(
  p_lat1 double precision, p_lon1 double precision,
  p_lat2 double precision, p_lon2 double precision
)
returns double precision
language sql
immutable
set search_path = public, pg_temp
as $$
  select 2 * 6371000.0 * asin(least(1.0, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lon2 - p_lon1) / 2), 2)
  )));
$$;

revoke execute on function public._distancia_m(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Trigger BEFORE INSERT: el servidor decide origen / revision / motivo.
--    El nombre "asistencias_0_servidor" ordena antes de "asistencias_validar",
--    así el anti-duplicado ve la hora ya corregida.
-- ---------------------------------------------------------------------------
create or replace function public.asistencias_servidor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := (select public.uid_actual());
  v_tope_min  integer;
  v_atraso_max integer;
  v_atraso    interval;
  v_tol       interval;
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

  return new;
end;
$$;

revoke execute on function public.asistencias_servidor() from public, anon, authenticated;

drop trigger if exists asistencias_0_servidor on public.asistencias;
create trigger asistencias_0_servidor
  before insert on public.asistencias
  for each row execute function public.asistencias_servidor();

-- ---------------------------------------------------------------------------
-- 4) Horas trabajadas (misma firma). Entrada → salida inmediata siguiente SI:
--    el mismo día local, ni entrada ni salida están por_revisar, y la duración
--    no pasa el tope, o la salida es aprobada/manual.
--    Es la única función que empareja entradas y salidas: progreso_horas,
--    progreso_equipo, el cierre de periodo y _cumplimiento_periodo la usan.
-- ---------------------------------------------------------------------------
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
  with cfg as (
    select coalesce((select c.jornada_maxima_horas from public.config_asistencia c limit 1), 10) as tope
  ),
  eventos as (
    select
      a.tipo,
      a.ocurrido_en,
      a.revision,
      lead(a.ocurrido_en) over w as siguiente,
      lead(a.tipo)        over w as tipo_siguiente,
      lead(a.revision)    over w as revision_siguiente,
      lead(a.origen)      over w as origen_siguiente
    from public.asistencias a
    where a.becario_id = p_becario
      and a.ocurrido_en >= p_desde
      and a.ocurrido_en <  p_hasta
    window w as (order by a.ocurrido_en)
  )
  select round(
    coalesce(sum(extract(epoch from (e.siguiente - e.ocurrido_en)) / 3600.0), 0)::numeric,
    2
  )
  from eventos e
  cross join cfg
  where e.tipo = 'entrada'
    and e.tipo_siguiente = 'salida'
    and (e.ocurrido_en at time zone 'America/Monterrey')::date
      = (e.siguiente   at time zone 'America/Monterrey')::date
    and e.revision <> 'por_revisar'
    and e.revision_siguiente <> 'por_revisar'
    and (
      extract(epoch from (e.siguiente - e.ocurrido_en)) / 3600.0 <= cfg.tope
      or e.revision_siguiente = 'aprobada'
      or e.origen_siguiente = 'manual'
    );
$$;

revoke execute on function public.horas_trabajadas(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.horas_trabajadas(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Bitácora: la llena un disparador AFTER (SECURITY DEFINER).
--    Registra altas manuales, toda edición, todo borrado y las aprobaciones.
-- ---------------------------------------------------------------------------
create or replace function public.asistencias_bitacora()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select public.uid_actual());
begin
  if tg_op = 'INSERT' then
    if new.origen = 'manual' then
      insert into public.bitacora_asistencias (asistencia_id, becario_id, accion, hecho_por, antes, despues)
      values (new.id, new.becario_id, 'agregar', v_uid, null, to_jsonb(new));
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.bitacora_asistencias (asistencia_id, becario_id, accion, hecho_por, antes, despues)
    values (
      new.id,
      new.becario_id,
      -- Solo cambió a 'aprobada' (sin tocar nada más): es una aprobación.
      case
        when old.revision <> 'aprobada' and new.revision = 'aprobada'
         and (to_jsonb(new) - 'revision') = (to_jsonb(old) - 'revision')
        then 'aprobar'
        else 'editar'
      end,
      v_uid,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  else
    insert into public.bitacora_asistencias (asistencia_id, becario_id, accion, hecho_por, antes, despues)
    values (old.id, old.becario_id, 'eliminar', v_uid, to_jsonb(old), null);
    return old;
  end if;
end;
$$;

revoke execute on function public.asistencias_bitacora() from public, anon, authenticated;

drop trigger if exists asistencias_bitacora on public.asistencias;
create trigger asistencias_bitacora
  after insert or update or delete on public.asistencias
  for each row execute function public.asistencias_bitacora();

-- ---------------------------------------------------------------------------
-- RLS y privilegios de las tablas nuevas: lectura para quien corresponde,
-- escritura SOLO por RPC o disparador (sin grants de escritura).
-- ---------------------------------------------------------------------------
alter table public.config_asistencia    enable row level security;
alter table public.geocercas            enable row level security;
alter table public.bitacora_asistencias enable row level security;

drop policy if exists config_asistencia_select on public.config_asistencia;
create policy config_asistencia_select on public.config_asistencia
  for select to authenticated using (true);

drop policy if exists geocercas_select on public.geocercas;
create policy geocercas_select on public.geocercas
  for select to authenticated using (true);

drop policy if exists bitacora_asistencias_select on public.bitacora_asistencias;
create policy bitacora_asistencias_select on public.bitacora_asistencias
  for select to authenticated
  using (
    public.es_admin()
    or public.es_ingeniero_de(becario_id)
    or becario_id = (select public.uid_actual())
  );

revoke all on table public.config_asistencia    from public, anon, authenticated;
revoke all on table public.geocercas            from public, anon, authenticated;
revoke all on table public.bitacora_asistencias from public, anon, authenticated;
grant select on table public.config_asistencia    to authenticated;
grant select on table public.geocercas            to authenticated;
grant select on table public.bitacora_asistencias to authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC
-- ---------------------------------------------------------------------------

-- Anomalías visibles para quien llama: administrador → todos los becarios
-- activos; ingeniero → los suyos; becario → solo él mismo.
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

-- Aprobar un registro: ingeniero asignado o administrador.
create or replace function public.aprobar_asistencia(p_asistencia uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_becario uuid;
begin
  select a.becario_id into v_becario from public.asistencias a where a.id = p_asistencia;
  if v_becario is null then
    raise exception 'El registro de asistencia no existe.';
  end if;
  if not (public.es_admin() or public.es_ingeniero_de(v_becario)) then
    raise exception 'Solo el ingeniero asignado o un administrador puede aprobar este registro.';
  end if;
  update public.asistencias set revision = 'aprobada'
  where id = p_asistencia and revision <> 'aprobada';
end;
$$;

-- Bitácora de un becario (con el nombre de quien hizo el cambio).
create or replace function public.bitacora_asistencias_de(p_becario uuid, p_limite integer default 50)
returns table (
  id               bigint,
  hecho_en         timestamptz,
  accion           text,
  hecho_por        uuid,
  hecho_por_nombre text,
  asistencia_id    uuid,
  antes            jsonb,
  despues          jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (
    public.es_admin()
    or public.es_ingeniero_de(p_becario)
    or p_becario = (select public.uid_actual())
  ) then
    raise exception 'No tienes acceso a la bitácora de ese becario.';
  end if;

  return query
  select b.id, b.hecho_en, b.accion, b.hecho_por, u.nombre, b.asistencia_id, b.antes, b.despues
  from public.bitacora_asistencias b
  left join public.usuarios u on u.id = b.hecho_por
  where b.becario_id = p_becario
  order by b.hecho_en desc, b.id desc
  limit greatest(1, least(coalesce(p_limite, 50), 500));
end;
$$;

-- Reglas de asistencia (administrador).
create or replace function public.guardar_config_asistencia(
  p_jornada_maxima          numeric,
  p_atraso_maximo_minutos   integer,
  p_tolerancia_minutos      integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar las reglas de asistencia.';
  end if;
  if p_jornada_maxima is null or p_jornada_maxima < 1 or p_jornada_maxima > 24 then
    raise exception 'La jornada máxima debe estar entre 1 y 24 horas.';
  end if;
  if p_atraso_maximo_minutos is null or p_atraso_maximo_minutos < 1 or p_atraso_maximo_minutos > 1440 then
    raise exception 'El atraso máximo debe estar entre 1 y 1440 minutos.';
  end if;
  if p_tolerancia_minutos is null or p_tolerancia_minutos < 1 or p_tolerancia_minutos > 60 then
    raise exception 'La tolerancia del reloj debe estar entre 1 y 60 minutos.';
  end if;

  insert into public.config_asistencia (id, jornada_maxima_horas, atraso_maximo_minutos, tolerancia_minutos, updated_at)
  values (true, p_jornada_maxima, p_atraso_maximo_minutos, p_tolerancia_minutos, now())
  on conflict (id) do update
    set jornada_maxima_horas = excluded.jornada_maxima_horas,
        atraso_maximo_minutos = excluded.atraso_maximo_minutos,
        tolerancia_minutos = excluded.tolerancia_minutos,
        updated_at = now();
end;
$$;

-- Alta (p_id null) o edición de una zona de registro (administrador).
create or replace function public.guardar_geocerca(
  p_id       uuid,
  p_nombre   text,
  p_latitud  numeric,
  p_longitud numeric,
  p_radio_m  integer,
  p_activa   boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar las zonas de registro.';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'Escribe un nombre para la zona.';
  end if;
  if p_latitud is null or p_latitud < -90 or p_latitud > 90 then
    raise exception 'La latitud debe estar entre -90 y 90.';
  end if;
  if p_longitud is null or p_longitud < -180 or p_longitud > 180 then
    raise exception 'La longitud debe estar entre -180 y 180.';
  end if;
  if p_radio_m is null or p_radio_m < 20 or p_radio_m > 5000 then
    raise exception 'El radio debe estar entre 20 y 5000 metros.';
  end if;

  if p_id is null then
    insert into public.geocercas (nombre, latitud, longitud, radio_m, activa)
    values (btrim(p_nombre), p_latitud, p_longitud, p_radio_m, coalesce(p_activa, true))
    returning id into v_id;
  else
    update public.geocercas
    set nombre = btrim(p_nombre), latitud = p_latitud, longitud = p_longitud,
        radio_m = p_radio_m, activa = coalesce(p_activa, activa), updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'La zona de registro no existe.';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.eliminar_geocerca(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede quitar zonas de registro.';
  end if;
  delete from public.geocercas where id = p_id;
  if not found then
    raise exception 'La zona de registro no existe.';
  end if;
end;
$$;

-- Privilegios de las RPC: solo usuarios con sesión (nada de anon).
revoke execute on function public.anomalias_asistencia(uuid, date, date) from public, anon;
revoke execute on function public.aprobar_asistencia(uuid) from public, anon;
revoke execute on function public.bitacora_asistencias_de(uuid, integer) from public, anon;
revoke execute on function public.guardar_config_asistencia(numeric, integer, integer) from public, anon;
revoke execute on function public.guardar_geocerca(uuid, text, numeric, numeric, integer, boolean) from public, anon;
revoke execute on function public.eliminar_geocerca(uuid) from public, anon;

grant execute on function public.anomalias_asistencia(uuid, date, date) to authenticated;
grant execute on function public.aprobar_asistencia(uuid) to authenticated;
grant execute on function public.bitacora_asistencias_de(uuid, integer) to authenticated;
grant execute on function public.guardar_config_asistencia(numeric, integer, integer) to authenticated;
grant execute on function public.guardar_geocerca(uuid, text, numeric, numeric, integer, boolean) to authenticated;
grant execute on function public.eliminar_geocerca(uuid) to authenticated;
