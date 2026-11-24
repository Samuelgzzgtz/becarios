-- 0027: Pedidos de la coordinación (noviembre 2026).
--
--  1. Turno mínimo: config_asistencia.turno_minimo_minutos (30 por omisión, 0 lo apaga).
--     Una salida propia que llega antes de ese tiempo tras la entrada del mismo día
--     queda por revisar con motivo 'salida_temprana' (no se aprueba en lote). No se
--     rechaza para no perder registros que estaban en la cola sin red. Si la salida
--     llega antes que su entrada (otro teléfono, cola desordenada), Por revisar la
--     sigue mostrando como salida temprana y aprobar_asistencias no la aprueba en lote.
--  2. guardar_config_asistencia recibe el turno mínimo (opcional: sin él se conserva).
--  3. Horario por omisión: todo becario nuevo, o que pasa a becario, empieza de lunes
--     a viernes en presencial; sábado y domingo en "No aplica" (no cuentan para lo
--     esperado). El ingeniero decide si agrega el sábado en Modalidad semanal. Los
--     becarios sin ningún día configurado reciben ese horario; los demás no cambian.
--  El reporte SIASE solo en PDF va aparte en 0028, que se aplica junto con la web
--  que ya lo explica; esta migración funciona con la web anterior.
begin;

-- ---------------------------------------------------------------------------
-- 1) Turno mínimo
-- ---------------------------------------------------------------------------
alter table public.config_asistencia
  add column if not exists turno_minimo_minutos integer not null default 30
    check (turno_minimo_minutos between 0 and 240);

alter table public.asistencias drop constraint asistencias_motivo_revision_check;
alter table public.asistencias add constraint asistencias_motivo_revision_check
  check (motivo_revision in ('atraso_cola', 'reloj_adelantado', 'sin_ubicacion', 'fuera_de_zona',
                             'sin_rostro', 'modalidad_distinta', 'revision_humana', 'salida_temprana'));

-- Igual que 0025, más la regla del turno mínimo antes de la revisión humana.
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
  v_turno_min  integer;
  v_prev_tipo  public.tipo_asistencia;
  v_prev_en    timestamptz;
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

  select c.tolerancia_minutos, c.atraso_maximo_minutos, c.turno_minimo_minutos
    into v_tope_min, v_atraso_max, v_turno_min
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

  -- Salida demasiado pronto tras la entrada del mismo día local (0027). La app ya no
  -- la deja registrar; esto atrapa la que llega de la cola sin red o de otra versión.
  if new.revision = 'ok' and new.tipo = 'salida' and coalesce(v_turno_min, 30) > 0 then
    select a.tipo, a.ocurrido_en into v_prev_tipo, v_prev_en
    from public.asistencias a
    where a.becario_id = new.becario_id and a.ocurrido_en < new.ocurrido_en
    order by a.ocurrido_en desc
    limit 1;
    if v_prev_tipo = 'entrada'
       and (v_prev_en at time zone 'America/Monterrey')::date = (new.ocurrido_en at time zone 'America/Monterrey')::date
       and new.ocurrido_en - v_prev_en < make_interval(mins => coalesce(v_turno_min, 30)) then
      new.revision := 'por_revisar';
      new.motivo_revision := 'salida_temprana';
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

-- Igual que 0025, con el detalle de 'salida_temprana'.
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
  detalle        text,
  -- Evidencia del registro asistencia_id.
  puntaje_rostro numeric,
  -- Metros fuera de la zona activa más cercana (0 = dentro); null en home office, sin ubicación o sin zonas.
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
  v_turno  integer;
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
  select coalesce((select c.turno_minimo_minutos from public.config_asistencia c limit 1), 30) into v_turno;

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
      -- 0027: una salida que llegó antes que su entrada se marcó como revisión humana;
      -- aquí se reconoce como salida temprana con la entrada que tiene antes.
      case when a.motivo_revision = 'revision_humana' and a.tipo = 'salida' and v_turno > 0
                and lag(a.tipo) over w = 'entrada'
                and (lag(a.ocurrido_en) over w at time zone 'America/Monterrey')::date
                    = (a.ocurrido_en at time zone 'America/Monterrey')::date
                and a.ocurrido_en - lag(a.ocurrido_en) over w < make_interval(mins => v_turno)
           then 'salida_temprana' else a.motivo_revision end as motivo_revision,
      a.created_at,
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
             when 'salida_temprana' then 'Salida registrada muy poco después de la entrada.'
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
          where g.activa and a.modalidad = 'presencial' and a.latitud is not null and a.longitud is not null),
         a.origen,
         greatest(0, floor(extract(epoch from (a.created_at - a.ocurrido_en)) / 60.0))::integer
  from filas f
  join public.asistencias a on a.id = f.asistencia_id
  -- Lo más antiguo primero: si PostgREST corta en max_rows, lo que queda fuera es lo más reciente.
  order by f.fecha, f.becario_nombre, f.ocurrido_en;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Configuración con turno mínimo
-- ---------------------------------------------------------------------------
drop function public.guardar_config_asistencia(numeric, integer, integer);
create function public.guardar_config_asistencia(
  p_jornada_maxima          numeric,
  p_atraso_maximo_minutos   integer,
  p_tolerancia_minutos      integer,
  p_turno_minimo_minutos    integer default null
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
  if p_turno_minimo_minutos is not null and (p_turno_minimo_minutos < 0 or p_turno_minimo_minutos > 240) then
    raise exception 'El turno mínimo debe estar entre 0 y 240 minutos.';
  end if;

  -- Sin turno mínimo (web anterior) se conserva el guardado.
  insert into public.config_asistencia (id, jornada_maxima_horas, atraso_maximo_minutos, tolerancia_minutos, turno_minimo_minutos, updated_at)
  values (true, p_jornada_maxima, p_atraso_maximo_minutos, p_tolerancia_minutos, coalesce(p_turno_minimo_minutos, 30), now())
  on conflict (id) do update
    set jornada_maxima_horas = excluded.jornada_maxima_horas,
        atraso_maximo_minutos = excluded.atraso_maximo_minutos,
        tolerancia_minutos = excluded.tolerancia_minutos,
        turno_minimo_minutos = coalesce(p_turno_minimo_minutos, public.config_asistencia.turno_minimo_minutos),
        updated_at = now();
end;
$$;

revoke execute on function public.guardar_config_asistencia(numeric, integer, integer, integer) from public, anon;
grant execute on function public.guardar_config_asistencia(numeric, integer, integer, integer) to authenticated;

-- Igual que 0026, más: una salida a menos del turno mínimo de su entrada no se
-- aprueba en lote aunque haya llegado marcada como revisión humana.
create or replace function public.aprobar_asistencias(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select public.uid_actual());
  v_n integer;
  v_turno integer := coalesce((select c.turno_minimo_minutos from public.config_asistencia c limit 1), 30);
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
           or a.becario_id not in (select public.becarios_a_cargo()))
  ) then
    raise exception 'Solo el ingeniero asignado puede aprobar estos registros.';
  end if;
  if exists (
    select 1 from public.asistencias a
    where a.id = any(p_ids)
      and a.revision <> 'aprobada'
      and a.motivo_revision is distinct from 'revision_humana'
  ) then
    raise exception 'Solo se aprueban juntos los registros en revisión humana; los demás se revisan uno por uno.';
  end if;
  if v_turno > 0 and exists (
    select 1
    from public.asistencias a
    cross join lateral (
      select b.tipo, b.ocurrido_en
      from public.asistencias b
      where b.becario_id = a.becario_id and b.ocurrido_en < a.ocurrido_en
      order by b.ocurrido_en desc
      limit 1
    ) ant
    where a.id = any(p_ids)
      and a.revision <> 'aprobada'
      and a.tipo = 'salida'
      and ant.tipo = 'entrada'
      and (ant.ocurrido_en at time zone 'America/Monterrey')::date = (a.ocurrido_en at time zone 'America/Monterrey')::date
      and a.ocurrido_en - ant.ocurrido_en < make_interval(mins => v_turno)
  ) then
    raise exception 'Hay una salida antes del turno mínimo; revísala uno por uno.';
  end if;
  update public.asistencias set revision = 'aprobada'
  where id = any(p_ids) and revision <> 'aprobada';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Horario por omisión: lunes a viernes presencial
-- ---------------------------------------------------------------------------
create or replace function public.horario_por_omision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.perfil = 'becario'
     and (tg_op = 'INSERT' or old.perfil is distinct from 'becario')
     and not exists (select 1 from public.horarios_modalidad h where h.becario_id = new.id) then
    insert into public.horarios_modalidad (becario_id, dia_semana, modalidad)
    select new.id, d, 'presencial' from generate_series(1, 5) d;
  end if;
  return null;
end;
$$;

revoke execute on function public.horario_por_omision() from public, anon, authenticated;

drop trigger if exists usuarios_horario_por_omision on public.usuarios;
create trigger usuarios_horario_por_omision
  after insert or update of perfil on public.usuarios
  for each row execute function public.horario_por_omision();

insert into public.horarios_modalidad (becario_id, dia_semana, modalidad)
select u.id, d, 'presencial'
from public.usuarios u
cross join generate_series(1, 5) d
where u.perfil = 'becario'
  and not exists (select 1 from public.horarios_modalidad h where h.becario_id = u.id);

commit;
