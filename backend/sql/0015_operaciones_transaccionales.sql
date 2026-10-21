-- Corrección de auditoría · 0015 — Operaciones de varios pasos como RPC atómicas
-- Hallazgos: C-05 (cierre de semestre sin resumen ni protección ante doble envío),
-- C-06 (aprobar/rechazar transferencias no atómico y con carreras), A-05
-- (re-enrolar falla por RLS), A-10 (asignar ingeniero no atómico), A-13 (dar de
-- baja / reactivar), M-10 (configuración a medias), M-11 (crear el primer periodo).
--
-- Todas son SECURITY DEFINER y validan el perfil adentro. Los mensajes de
-- error están en español porque la app los muestra tal cual (código P0001).

-- ---------------------------------------------------------------------------
-- Interno: reasigna un becario (desactiva la asignación vigente e inserta la
-- nueva) dentro de la transacción de quien llama. No ejecutable por usuarios.
-- ---------------------------------------------------------------------------
create or replace function public._reasignar_becario(p_becario uuid, p_ingeniero uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ingenieros_becarios
  set activo = false
  where becario_id = p_becario and activo;

  insert into public.ingenieros_becarios (ingeniero_id, becario_id, fecha_asignacion, activo)
  values (p_ingeniero, p_becario, public.hoy_local(), true);
end;
$$;

revoke execute on function public._reasignar_becario(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- C-06: resolver una transferencia en una sola transacción, con bloqueo de la
-- fila. Un segundo toque (o un segundo admin) recibe "ya fue resuelta".
-- ---------------------------------------------------------------------------
create or replace function public.resolver_transferencia(p_transferencia uuid, p_aprobar boolean)
returns public.estado_transferencia
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.transferencias;
  v_actual uuid;
  v_estado public.estado_transferencia;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede resolver transferencias.';
  end if;

  select * into t from public.transferencias where id = p_transferencia for update;
  if not found then
    raise exception 'La solicitud de transferencia ya no existe.';
  end if;
  if t.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue resuelta.';
  end if;

  if p_aprobar then
    select ib.ingeniero_id into v_actual
    from public.ingenieros_becarios ib
    where ib.becario_id = t.becario_id and ib.activo
    for update;

    if v_actual is distinct from t.ingeniero_origen then
      raise exception 'El becario ya no está con el ingeniero que pidió la transferencia; rechaza esta solicitud.';
    end if;
    if not exists (
      select 1 from public.usuarios u
      where u.id = t.ingeniero_destino and u.perfil = 'ingeniero' and u.estado = 'activo'
    ) then
      raise exception 'El ingeniero destino ya no está activo.';
    end if;

    perform public._reasignar_becario(t.becario_id, t.ingeniero_destino);
    v_estado := 'aprobada';
  else
    v_estado := 'rechazada';
  end if;

  update public.transferencias
  set estado = v_estado, resuelta_por = (select auth.uid())
  where id = t.id;

  return v_estado;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-10: asignar/reasignar ingeniero de forma atómica. Si ya lo tenía asignado
-- no hace nada. Las transferencias pendientes de ese becario quedan rechazadas
-- (ya no aplican tras la reasignación directa).
-- ---------------------------------------------------------------------------
create or replace function public.asignar_ingeniero(p_becario uuid, p_ingeniero uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede asignar ingenieros.';
  end if;
  if not exists (select 1 from public.usuarios where id = p_becario and perfil = 'becario') then
    raise exception 'El becario no existe.';
  end if;
  if not exists (
    select 1 from public.usuarios where id = p_ingeniero and perfil = 'ingeniero' and estado = 'activo'
  ) then
    raise exception 'El ingeniero elegido no existe o está inactivo.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('asignacion:' || p_becario::text, 0));

  select ingeniero_id into v_actual
  from public.ingenieros_becarios
  where becario_id = p_becario and activo;

  if v_actual = p_ingeniero then
    return;
  end if;

  perform public._reasignar_becario(p_becario, p_ingeniero);

  update public.transferencias
  set estado = 'rechazada', resuelta_por = (select auth.uid())
  where becario_id = p_becario and estado = 'pendiente';
end;
$$;

-- ---------------------------------------------------------------------------
-- A-05: enrolar / re-enrolar. El ingeniero no puede LEER enrolamientos (dato
-- biométrico), por eso el UPDATE...WHERE activo del cliente tocaba 0 filas y
-- el INSERT chocaba con el índice único. Aquí se hace todo del lado servidor.
-- Devuelve true si reemplazó una biometría existente.
-- ---------------------------------------------------------------------------
create or replace function public.enrolar_becario(
  p_becario   uuid,
  p_embedding real[],
  p_modelo    text,
  p_dimension integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reemplazados integer;
begin
  if not (public.es_ingeniero_de(p_becario) or public.es_admin()) then
    raise exception 'Solo el ingeniero asignado puede enrolar a este becario.';
  end if;
  if coalesce(array_length(p_embedding, 1), 0) = 0 or array_length(p_embedding, 1) <> p_dimension then
    raise exception 'La biometría capturada no es válida; vuelve a tomar las fotos.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('enrolamiento:' || p_becario::text, 0));

  update public.enrolamientos_faciales
  set activo = false
  where becario_id = p_becario and activo;
  get diagnostics v_reemplazados = row_count;

  insert into public.enrolamientos_faciales
    (becario_id, embedding_vector, modelo, dimension, capturado_por, activo)
  values
    (p_becario, p_embedding, p_modelo, p_dimension, (select auth.uid()), true);

  return v_reemplazados > 0;
end;
$$;

-- ¿Ya tiene biometría? (para avisar "se reemplazará") sin exponer el vector.
create or replace function public.tiene_enrolamiento(p_becario uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (p_becario = (select auth.uid()) or public.es_ingeniero_de(p_becario) or public.es_admin()) then
    raise exception 'No tienes acceso a este becario.';
  end if;
  return exists (
    select 1 from public.enrolamientos_faciales where becario_id = p_becario and activo
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- M-10: metas + ventana en una sola transacción, con validación legible.
-- ---------------------------------------------------------------------------
alter table public.ventana_siase
  add constraint ventana_siase_orden check (dia_apertura <= dia_cierre);

create or replace function public.guardar_configuracion(
  p_meta_semanal   numeric,
  p_meta_mensual   numeric,
  p_meta_semestral numeric,
  p_dia_apertura   integer,
  p_dia_cierre     integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar la configuración.';
  end if;
  if p_meta_semanal < 0 or p_meta_mensual < 0 or p_meta_semestral < 0 then
    raise exception 'Las metas de horas no pueden ser negativas.';
  end if;
  if p_dia_apertura < 1 or p_dia_cierre > 31 or p_dia_apertura > p_dia_cierre then
    raise exception 'La ventana SIASE debe cumplir 1 ≤ apertura ≤ cierre ≤ 31.';
  end if;

  update public.metas_horas
  set meta_semanal = p_meta_semanal, meta_mensual = p_meta_mensual, meta_semestral = p_meta_semestral
  where becario_id is null;
  if not found then
    insert into public.metas_horas (becario_id, meta_semanal, meta_mensual, meta_semestral)
    values (null, p_meta_semanal, p_meta_mensual, p_meta_semestral);
  end if;

  insert into public.ventana_siase (id, dia_apertura, dia_cierre)
  values (true, p_dia_apertura, p_dia_cierre)
  on conflict (id) do update
    set dia_apertura = excluded.dia_apertura, dia_cierre = excluded.dia_cierre;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cumplimiento de un periodo (interno): cuántos becarios activos hay y
-- cuántos alcanzaron su meta semestral, con fronteras en hora local.
-- ---------------------------------------------------------------------------
create or replace function public._cumplimiento_periodo(p_inicio date, p_fin date)
returns table (becarios_activos integer, becarios_cumplidos integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*)::integer,
    count(*) filter (where m.meta is not null and h.horas >= m.meta)::integer
  from public.usuarios u
  cross join lateral (
    select public.horas_trabajadas(u.id, public.inicio_dia_local(p_inicio), public.inicio_dia_local(p_fin + 1)) as horas
  ) h
  cross join lateral (
    select coalesce(
      (select meta_semestral from public.metas_horas where becario_id = u.id),
      (select meta_semestral from public.metas_horas where becario_id is null)
    ) as meta
  ) m
  where u.perfil = 'becario' and u.estado = 'activo';
$$;

revoke execute on function public._cumplimiento_periodo(date, date) from public, anon, authenticated;

-- C-05: resumen para el diálogo de confirmación antes de cerrar.
create or replace function public.vista_previa_cierre()
returns table (
  periodo_id         uuid,
  nombre             text,
  fecha_inicio       date,
  fecha_fin          date,
  becarios_activos   integer,
  becarios_cumplidos integer
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
    select p.id, p.nombre, p.fecha_inicio, p.fecha_fin, c.becarios_activos, c.becarios_cumplidos
    from public._cumplimiento_periodo(p.fecha_inicio, p.fecha_fin) c;
end;
$$;

-- ---------------------------------------------------------------------------
-- C-05: cierre de semestre. Nuevo parámetro p_periodo_actual: si el cliente lo
-- manda y ya no es el activo (doble envío, otro admin cerró antes), se rechaza
-- en vez de cerrar también el periodo recién abierto.
-- ---------------------------------------------------------------------------
drop function public.cerrar_semestre(text, public.tipo_periodo, date, date);

create function public.cerrar_semestre(
  p_nuevo_nombre   text,
  p_nuevo_tipo     public.tipo_periodo,
  p_nuevo_inicio   date,
  p_nuevo_fin      date,
  p_periodo_actual uuid default null
)
returns table (periodo_cerrado uuid, periodo_nuevo uuid, becarios_activos integer, becarios_cumplidos integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_anterior public.periodos_academicos;
  v_nuevo    uuid;
  v_activos  integer;
  v_cumplidos integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cerrar el semestre.';
  end if;
  if coalesce(trim(p_nuevo_nombre), '') = '' then
    raise exception 'Escribe el nombre del nuevo periodo.';
  end if;
  if p_nuevo_fin <= p_nuevo_inicio then
    raise exception 'La fecha de fin del nuevo periodo debe ser posterior a la de inicio.';
  end if;

  select * into v_anterior from public.periodos_academicos pa where pa.activo limit 1 for update;
  if not found then
    raise exception 'No hay un periodo activo que cerrar; crea el primer periodo.';
  end if;
  if p_periodo_actual is not null and v_anterior.id <> p_periodo_actual then
    raise exception 'El periodo activo cambió mientras confirmabas; vuelve a cargar la pantalla.';
  end if;
  if p_nuevo_inicio <= v_anterior.fecha_inicio then
    raise exception 'El nuevo periodo debe empezar después del inicio del periodo actual.';
  end if;

  select c.becarios_activos, c.becarios_cumplidos into v_activos, v_cumplidos
  from public._cumplimiento_periodo(v_anterior.fecha_inicio, v_anterior.fecha_fin) c;

  update public.periodos_academicos set activo = false where id = v_anterior.id;

  insert into public.periodos_academicos (nombre, tipo, fecha_inicio, fecha_fin, activo)
  values (trim(p_nuevo_nombre), p_nuevo_tipo, p_nuevo_inicio, p_nuevo_fin, true)
  returning id into v_nuevo;

  return query select v_anterior.id, v_nuevo, v_activos, v_cumplidos;
end;
$$;

-- M-11: abrir un periodo cuando no hay ninguno activo.
create or replace function public.abrir_periodo(
  p_nombre text,
  p_tipo   public.tipo_periodo,
  p_inicio date,
  p_fin    date
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
    raise exception 'Solo un administrador puede abrir periodos.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Escribe el nombre del periodo.';
  end if;
  if p_fin <= p_inicio then
    raise exception 'La fecha de fin debe ser posterior a la de inicio.';
  end if;
  if exists (select 1 from public.periodos_academicos where activo) then
    raise exception 'Ya hay un periodo activo; ciérralo para abrir otro.';
  end if;

  insert into public.periodos_academicos (nombre, tipo, fecha_inicio, fecha_fin, activo)
  values (trim(p_nombre), p_tipo, p_inicio, p_fin, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-13: dar de baja / reactivar. Un ingeniero con becarios asignados no se
-- puede dar de baja (quedarían sin supervisor): primero hay que reasignarlos.
-- ---------------------------------------------------------------------------
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
  if p_usuario = (select auth.uid()) then
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

  update public.usuarios set estado = p_estado where id = p_usuario;

  if p_estado <> 'activo' then
    update public.transferencias
    set estado = 'rechazada', resuelta_por = (select auth.uid())
    where estado = 'pendiente'
      and (becario_id = p_usuario or ingeniero_destino = p_usuario or ingeniero_origen = p_usuario);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios.
-- ---------------------------------------------------------------------------
revoke execute on function public.resolver_transferencia(uuid, boolean) from public, anon;
revoke execute on function public.asignar_ingeniero(uuid, uuid) from public, anon;
revoke execute on function public.enrolar_becario(uuid, real[], text, integer) from public, anon;
revoke execute on function public.tiene_enrolamiento(uuid) from public, anon;
revoke execute on function public.guardar_configuracion(numeric, numeric, numeric, integer, integer) from public, anon;
revoke execute on function public.vista_previa_cierre() from public, anon;
revoke execute on function public.cerrar_semestre(text, public.tipo_periodo, date, date, uuid) from public, anon;
revoke execute on function public.abrir_periodo(text, public.tipo_periodo, date, date) from public, anon;
revoke execute on function public.cambiar_estado_usuario(uuid, public.estado_usuario) from public, anon;

grant execute on function public.resolver_transferencia(uuid, boolean) to authenticated;
grant execute on function public.asignar_ingeniero(uuid, uuid) to authenticated;
grant execute on function public.enrolar_becario(uuid, real[], text, integer) to authenticated;
grant execute on function public.tiene_enrolamiento(uuid) to authenticated;
grant execute on function public.guardar_configuracion(numeric, numeric, numeric, integer, integer) to authenticated;
grant execute on function public.vista_previa_cierre() to authenticated;
grant execute on function public.cerrar_semestre(text, public.tipo_periodo, date, date, uuid) to authenticated;
grant execute on function public.abrir_periodo(text, public.tipo_periodo, date, date) to authenticated;
grant execute on function public.cambiar_estado_usuario(uuid, public.estado_usuario) to authenticated;
