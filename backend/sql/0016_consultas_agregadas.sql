-- Corrección de auditoría · 0016 — Consultas agregadas en una sola llamada
-- Hallazgos: M-09 (N+1 RPC por becario y "en riesgo" mal calculado), M-05
-- (indicadores del panel engañosos), A-16 (CSV truncado a 1000 filas, en UTC y
-- sin becarios inactivos).

-- ---------------------------------------------------------------------------
-- Progreso de todos los becarios activos que el que llama puede ver (RLS):
-- ingeniero → su equipo; admin → todos. Reemplaza el bucle de progreso_horas
-- por becario en Dashboard, Mis Becarios y Reporte de horas global.
--
-- dias_laborales_semana / dias_laborales_transcurridos sirven para el cálculo
-- de "en riesgo": se espera meta_semanal * transcurridos / laborales, contando
-- solo los días laborales YA TERMINADOS (de lunes a ayer, hora local).
-- Días laborales = los configurados en horarios_modalidad; si el becario no
-- tiene ninguno configurado, lunes a viernes.
-- ---------------------------------------------------------------------------
create or replace function public.progreso_equipo()
returns table (
  becario_id                   uuid,
  nombre                       text,
  matricula                    text,
  ingeniero_id                 uuid,
  horas_semana                 numeric,
  horas_mes                    numeric,
  horas_semestre               numeric,
  meta_semanal                 numeric,
  meta_mensual                 numeric,
  meta_semestral               numeric,
  dias_laborales_semana        integer,
  dias_laborales_transcurridos integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    u.id,
    u.nombre,
    u.matricula,
    ib.ingeniero_id,
    p.horas_semana,
    p.horas_mes,
    p.horas_semestre,
    p.meta_semanal,
    p.meta_mensual,
    p.meta_semestral,
    d.total,
    d.transcurridos
  from public.usuarios u
  left join public.ingenieros_becarios ib on ib.becario_id = u.id and ib.activo
  cross join lateral public.progreso_horas(u.id) p
  cross join lateral (
    select
      count(*)::integer as total,
      count(*) filter (
        where (case when l.dia = 0 then 7 else l.dia end) < extract(isodow from public.hoy_local())
      )::integer as transcurridos
    from (
      select h.dia_semana::integer as dia
      from public.horarios_modalidad h
      where h.becario_id = u.id
      union all
      select g
      from generate_series(1, 5) g
      where not exists (select 1 from public.horarios_modalidad h2 where h2.becario_id = u.id)
    ) l
  ) d
  where u.perfil = 'becario'
    and u.estado = 'activo'
  order by u.nombre;
$$;

-- ---------------------------------------------------------------------------
-- Indicadores del panel del administrador en una sola llamada.
--   siase_por_firmar   = filas en 'subido' de cualquier mes (lo que hay que atender)
--   siase_sin_entregar = becarios activos cuyo estado efectivo del mes en curso
--                        es pendiente o sin_reporte (con o sin fila)
--   becarios_sin_asignar = becarios activos sin asignación vigente
-- ---------------------------------------------------------------------------
create or replace function public.indicadores_admin()
returns table (
  becarios_activos          integer,
  ingenieros_activos        integer,
  becarios_sin_asignar      integer,
  transferencias_pendientes integer,
  siase_por_firmar          integer,
  siase_sin_entregar        integer,
  periodo_nombre            text,
  periodo_fin               date,
  ventana_abierta           boolean,
  ventana_dias_restantes    integer
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede ver los indicadores generales.';
  end if;

  return query
  select
    (select count(*)::integer from public.usuarios u where u.perfil = 'becario' and u.estado = 'activo'),
    (select count(*)::integer from public.usuarios u where u.perfil = 'ingeniero' and u.estado = 'activo'),
    (select count(*)::integer from public.usuarios u
       where u.perfil = 'becario' and u.estado = 'activo'
         and not exists (select 1 from public.ingenieros_becarios ib where ib.becario_id = u.id and ib.activo)),
    (select count(*)::integer from public.transferencias t where t.estado = 'pendiente'),
    (select count(*)::integer from public.reportes_siase r where r.estado = 'subido'),
    (select count(*)::integer from public.reportes_siase_mes() s where s.estado in ('pendiente', 'sin_reporte')),
    (select p.nombre from public.periodos_academicos p where p.activo limit 1),
    (select p.fecha_fin from public.periodos_academicos p where p.activo limit 1),
    (select e.abierta from public.estado_ventana_siase() e),
    (select e.dias_restantes from public.estado_ventana_siase() e);
end;
$$;

-- ---------------------------------------------------------------------------
-- Exportación de asistencias por páginas (PostgREST corta en 1000 filas).
-- p_desde y p_hasta son fechas LOCALES, ambas inclusivas. Incluye becarios
-- inactivos (las asistencias históricas son suyas igual). Fecha y hora salen
-- ya en hora de Monterrey.
-- ---------------------------------------------------------------------------
create or replace function public.exportar_asistencias(
  p_desde  date,
  p_hasta  date,
  p_offset integer default 0,
  p_limite integer default 1000
)
returns table (
  id          uuid,
  matricula   text,
  nombre      text,
  tipo        text,
  modalidad   text,
  fecha       text,
  hora        text,
  ocurrido_en timestamptz
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
    a.ocurrido_en
  from public.asistencias a
  join public.usuarios u on u.id = a.becario_id
  where a.ocurrido_en >= public.inicio_dia_local(p_desde)
    and a.ocurrido_en <  public.inicio_dia_local(p_hasta + 1)
  order by a.ocurrido_en, a.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limite, 1), 1000);
end;
$$;

revoke execute on function public.progreso_equipo() from public, anon;
revoke execute on function public.indicadores_admin() from public, anon;
revoke execute on function public.exportar_asistencias(date, date, integer, integer) from public, anon;
grant execute on function public.progreso_equipo() to authenticated;
grant execute on function public.indicadores_admin() to authenticated;
grant execute on function public.exportar_asistencias(date, date, integer, integer) to authenticated;
