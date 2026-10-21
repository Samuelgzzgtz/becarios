-- Fase 2 · 0005 — Funciones de negocio
-- Plan, "Backend" puntos 2 a 5.

-- ---------------------------------------------------------------------------
-- Horas trabajadas en un rango: empareja cada 'entrada' con la 'salida'
-- inmediata siguiente. Las entradas sin salida no suman (turno abierto).
--
-- NO es security definer a propósito: corre bajo el RLS de quien la llama,
-- así que un becario que pregunte por otro recibe 0, no datos ajenos.
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
      lead(a.ocurrido_en) over (order by a.ocurrido_en) as siguiente,
      lead(a.tipo)        over (order by a.ocurrido_en) as tipo_siguiente
    from public.asistencias a
    where a.becario_id = p_becario
      and a.ocurrido_en >= p_desde
      and a.ocurrido_en <  p_hasta
  )
  select round(
    coalesce(sum(extract(epoch from (siguiente - ocurrido_en)) / 3600.0), 0)::numeric,
    2
  )
  from eventos
  where tipo = 'entrada' and tipo_siguiente = 'salida';
$$;

-- ---------------------------------------------------------------------------
-- Progreso semana / mes / semestre contra las metas configuradas.
-- La app llama esto en vez de recalcular en el dispositivo.
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
  )
  select
    p_becario,
    public.horas_trabajadas(p_becario, date_trunc('week', now()), now()),
    public.horas_trabajadas(p_becario, date_trunc('month', now()), now()),
    public.horas_trabajadas(
      p_becario,
      coalesce((select fecha_inicio from periodo)::timestamptz, date_trunc('year', now())),
      least(now(), coalesce((select fecha_fin + 1 from periodo)::timestamptz, now()))
    ),
    (select meta_semanal   from meta),
    (select meta_mensual   from meta),
    (select meta_semestral from meta);
$$;

-- ---------------------------------------------------------------------------
-- Ventana SIASE: ¿está abierta y cuántos días quedan?
-- Alimenta el aviso "quedan 3 días".
-- ---------------------------------------------------------------------------
create or replace function public.estado_ventana_siase(p_fecha date default current_date)
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
  -- El día de cierre se recorta al último día del mes (febrero, meses de 30).
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

-- ---------------------------------------------------------------------------
-- Cierre de ventana: marca "sin_reporte" a quien no subió nada.
-- La corre el job programado (ver 0006).
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_ventana_siase(p_mes date default date_trunc('month', current_date)::date)
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
    raise exception 'No hay periodo academico activo';
  end if;

  -- Becarios activos sin fila de reporte para el mes: se crea en sin_reporte.
  insert into public.reportes_siase (becario_id, periodo_id, mes, estado)
  select u.id, v_periodo, p_mes, 'sin_reporte'
  from public.usuarios u
  where u.perfil = 'becario'
    and u.estado = 'activo'
  on conflict (becario_id, mes) do nothing;

  -- Los que quedaron en 'pendiente' pasan a 'sin_reporte'.
  update public.reportes_siase
  set estado = 'sin_reporte'
  where mes = p_mes and estado = 'pendiente';

  get diagnostics v_afectados = row_count;
  return v_afectados;
end;
$$;

revoke execute on function public.cerrar_ventana_siase(date) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cierre de semestre: archiva el periodo activo y abre el siguiente.
-- Devuelve cuántos becarios cumplieron su meta semestral.
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_semestre(
  p_nuevo_nombre  text,
  p_nuevo_tipo    public.tipo_periodo,
  p_nuevo_inicio  date,
  p_nuevo_fin     date
)
returns table (periodo_cerrado uuid, periodo_nuevo uuid, becarios_cumplidos integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_anterior uuid;
  v_inicio   date;
  v_fin      date;
  v_nuevo    uuid;
  v_cumplidos integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cerrar el semestre';
  end if;

  select id, fecha_inicio, fecha_fin
    into v_anterior, v_inicio, v_fin
  from public.periodos_academicos where activo limit 1;

  if v_anterior is null then
    raise exception 'No hay periodo academico activo';
  end if;

  select count(*)::integer into v_cumplidos
  from public.usuarios u
  join lateral (
    select public.horas_trabajadas(u.id, v_inicio::timestamptz, (v_fin + 1)::timestamptz) as horas
  ) h on true
  join lateral (
    select coalesce(
      (select meta_semestral from public.metas_horas where becario_id = u.id),
      (select meta_semestral from public.metas_horas where becario_id is null)
    ) as meta
  ) m on true
  where u.perfil = 'becario' and u.estado = 'activo'
    and m.meta is not null and h.horas >= m.meta;

  update public.periodos_academicos set activo = false where id = v_anterior;

  insert into public.periodos_academicos (nombre, tipo, fecha_inicio, fecha_fin, activo)
  values (p_nuevo_nombre, p_nuevo_tipo, p_nuevo_inicio, p_nuevo_fin, true)
  returning id into v_nuevo;

  return query select v_anterior, v_nuevo, v_cumplidos;
end;
$$;

revoke execute on function public.cerrar_semestre(text, public.tipo_periodo, date, date) from anon;
