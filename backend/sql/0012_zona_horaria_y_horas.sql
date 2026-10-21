-- Corrección de auditoría · 0012 — Hora de Monterrey y emparejamiento por día
-- Hallazgos: A-06 (fronteras de día/semana/mes en UTC) y C-04 (una entrada
-- olvidada se emparejaba con la salida del día siguiente → jornadas de 24 h).
--
-- La base corre con TimeZone = UTC. En vez de cambiar la zona de toda la base
-- (afecta a cualquier otra cosa que lea timestamps), las funciones de negocio
-- convierten explícitamente a 'America/Monterrey'.

-- ---------------------------------------------------------------------------
-- Helpers de fecha local.
-- ---------------------------------------------------------------------------
create or replace function public.hoy_local()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Monterrey')::date;
$$;

-- Medianoche local de una fecha, como instante absoluto.
create or replace function public.inicio_dia_local(p_fecha date)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select p_fecha::timestamp at time zone 'America/Monterrey';
$$;

-- ---------------------------------------------------------------------------
-- Horas trabajadas: una entrada solo se empareja con la salida inmediata
-- siguiente SI ambas caen en el mismo día local. Una entrada sin salida ese
-- día queda como "turno abierto" y no suma (antes se emparejaba con la salida
-- del día siguiente y sumaba 24 h).
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
  with eventos as (
    select
      a.tipo,
      a.ocurrido_en,
      lead(a.ocurrido_en) over w as siguiente,
      lead(a.tipo)        over w as tipo_siguiente
    from public.asistencias a
    where a.becario_id = p_becario
      and a.ocurrido_en >= p_desde
      and a.ocurrido_en <  p_hasta
    window w as (order by a.ocurrido_en)
  )
  select round(
    coalesce(sum(extract(epoch from (siguiente - ocurrido_en)) / 3600.0), 0)::numeric,
    2
  )
  from eventos
  where tipo = 'entrada'
    and tipo_siguiente = 'salida'
    and (ocurrido_en at time zone 'America/Monterrey')::date
      = (siguiente   at time zone 'America/Monterrey')::date;
$$;

-- ---------------------------------------------------------------------------
-- Progreso semana / mes / semestre con fronteras locales (lunes 00:00 y día 1
-- 00:00 hora de Monterrey, no UTC).
-- ---------------------------------------------------------------------------
create or replace function public.progreso_horas(p_becario uuid default auth.uid())
returns table (
  becario_id      uuid,
  horas_semana    numeric,
  horas_mes       numeric,
  horas_semestre  numeric,
  meta_semanal    numeric,
  meta_mensual    numeric,
  meta_semestral  numeric
)
language sql
stable
set search_path = public, pg_temp
as $$
  with periodo as (
    select p.fecha_inicio, p.fecha_fin
    from public.periodos_academicos p
    where p.activo
    limit 1
  ),
  meta as (
    select m.meta_semanal, m.meta_mensual, m.meta_semestral
    from public.metas_horas m
    where m.becario_id = p_becario or m.becario_id is null
    order by m.becario_id nulls last -- la meta individual gana sobre la global
    limit 1
  ),
  local_ as (
    select now() at time zone 'America/Monterrey' as ahora
  )
  select
    p_becario,
    public.horas_trabajadas(p_becario, date_trunc('week',  l.ahora) at time zone 'America/Monterrey', now()),
    public.horas_trabajadas(p_becario, date_trunc('month', l.ahora) at time zone 'America/Monterrey', now()),
    public.horas_trabajadas(
      p_becario,
      coalesce(
        public.inicio_dia_local((select fecha_inicio from periodo)),
        date_trunc('year', l.ahora) at time zone 'America/Monterrey'
      ),
      least(now(), coalesce(public.inicio_dia_local((select fecha_fin from periodo) + 1), now()))
    ),
    (select meta_semanal   from meta),
    (select meta_mensual   from meta),
    (select meta_semestral from meta)
  from local_ l;
$$;

-- ---------------------------------------------------------------------------
-- Ventana SIASE: el "hoy" por defecto es el día local. Antes, a partir de las
-- 18:00 del día de cierre la base ya creía que era el día siguiente.
-- ---------------------------------------------------------------------------
drop function public.estado_ventana_siase(date);

create function public.estado_ventana_siase(p_fecha date default public.hoy_local())
returns table (
  abierta         boolean,
  fecha_apertura  date,
  fecha_cierre    date,
  dias_restantes  integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  with cfg as (
    select v.dia_apertura, v.dia_cierre from public.ventana_siase v limit 1
  ),
  limites as (
    select
      make_date(
        extract(year from p_fecha)::int,
        extract(month from p_fecha)::int,
        least(c.dia_apertura, extract(day from (date_trunc('month', p_fecha) + interval '1 month - 1 day'))::int)
      ) as apertura,
      make_date(
        extract(year from p_fecha)::int,
        extract(month from p_fecha)::int,
        least(c.dia_cierre, extract(day from (date_trunc('month', p_fecha) + interval '1 month - 1 day'))::int)
      ) as cierre
    from cfg c
  )
  select
    p_fecha between l.apertura and l.cierre,
    l.apertura,
    l.cierre,
    greatest((l.cierre - p_fecha), 0)
  from limites l;
$$;

-- cerrar_ventana_siase queda por compatibilidad (si algún día se instala
-- pg_cron), pero ya no es necesaria: ver reportes_siase_mes() en 0014.
drop function public.cerrar_ventana_siase(date);

create function public.cerrar_ventana_siase(p_mes date default date_trunc('month', public.hoy_local())::date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_periodo uuid;
  v_afectados integer;
begin
  select id into v_periodo from public.periodos_academicos where activo limit 1;
  if v_periodo is null then
    raise exception 'No hay un periodo académico activo.';
  end if;

  insert into public.reportes_siase (becario_id, periodo_id, mes, estado)
  select u.id, v_periodo, p_mes, 'sin_reporte'
  from public.usuarios u
  where u.perfil = 'becario'
    and u.estado = 'activo'
  on conflict (becario_id, mes) do nothing;

  update public.reportes_siase
  set estado = 'sin_reporte'
  where mes = p_mes and estado = 'pendiente';

  get diagnostics v_afectados = row_count;
  return v_afectados;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios: nada de esto lo necesita "anon" (Supabase concede EXECUTE a
-- anon/authenticated por rol al crear funciones en public; ver README).
-- ---------------------------------------------------------------------------
revoke execute on function public.hoy_local() from public, anon;
revoke execute on function public.inicio_dia_local(date) from public, anon;
revoke execute on function public.horas_trabajadas(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.progreso_horas(uuid) from public, anon;
revoke execute on function public.estado_ventana_siase(date) from public, anon;
revoke execute on function public.cerrar_ventana_siase(date) from public, anon, authenticated;

grant execute on function public.hoy_local() to authenticated;
grant execute on function public.inicio_dia_local(date) to authenticated;
grant execute on function public.horas_trabajadas(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.progreso_horas(uuid) to authenticated;
grant execute on function public.estado_ventana_siase(date) to authenticated;
