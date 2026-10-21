-- Fase 2 · 0007 — Endurecimiento tras los advisors de Supabase
-- Corrige: search_path mutable, funciones SECURITY DEFINER expuestas de más
-- por el grant por defecto a PUBLIC, llaves foráneas sin índice, políticas
-- RLS que reevalúan auth.uid() por fila, y políticas permisivas duplicadas.

-- ---------------------------------------------------------------------------
-- 1) search_path fijo en la función que faltaba.
-- ---------------------------------------------------------------------------
alter function public.tocar_updated_at() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2) Privilegios mínimos: quitar el EXECUTE que Postgres otorga a PUBLIC por
-- defecto (eso es lo que dejaba a "anon" ejecutar funciones SECURITY DEFINER
-- como cerrar_ventana_siase, que no tiene guardia de admin adentro), y volver
-- a conceder solo a "authenticated" donde la app realmente las necesita.
-- ---------------------------------------------------------------------------
revoke execute on function public.tocar_updated_at() from public;
revoke execute on function public.manejar_nuevo_usuario() from public;
revoke execute on function public.proteger_campos_usuario() from public;
revoke execute on function public.cerrar_ventana_siase(date) from public;

revoke execute on function public.perfil_actual() from public;
revoke execute on function public.es_admin() from public;
revoke execute on function public.es_ingeniero_de(uuid) from public;
revoke execute on function public.cerrar_semestre(text, public.tipo_periodo, date, date) from public;
revoke execute on function public.horas_trabajadas(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.progreso_horas(uuid) from public;
revoke execute on function public.estado_ventana_siase(date) from public;

grant execute on function public.perfil_actual() to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_ingeniero_de(uuid) to authenticated;
grant execute on function public.cerrar_semestre(text, public.tipo_periodo, date, date) to authenticated;
grant execute on function public.horas_trabajadas(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.progreso_horas(uuid) to authenticated;
grant execute on function public.estado_ventana_siase(date) to authenticated;

-- cerrar_ventana_siase se queda sin grant: solo la corre el job de pg_cron
-- (que ejecuta como el rol que programó el job, no como anon/authenticated).

-- ---------------------------------------------------------------------------
-- 3) auth.uid() envuelto en (select ...) dentro de los helpers, para que
-- Postgres lo resuelva una sola vez por consulta (initplan) y no por fila.
-- ---------------------------------------------------------------------------
create or replace function public.perfil_actual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.perfil from public.usuarios u where u.id = (select auth.uid());
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid())
      and u.perfil = 'administrador'
      and u.estado = 'activo'
  );
$$;

create or replace function public.es_ingeniero_de(p_becario uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ingenieros_becarios ib
    where ib.ingeniero_id = (select auth.uid())
      and ib.becario_id = p_becario
      and ib.activo
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) Índices para las llaves foráneas que no lo tenían.
-- ---------------------------------------------------------------------------
create index asistencias_verificado_por_idx on public.asistencias (verificado_por);
create index enrolamientos_faciales_capturado_por_idx on public.enrolamientos_faciales (capturado_por);
create index reportes_siase_firmado_por_idx on public.reportes_siase (firmado_por);
create index reportes_siase_periodo_id_idx on public.reportes_siase (periodo_id);
create index transferencias_ingeniero_destino_idx on public.transferencias (ingeniero_destino);
create index transferencias_ingeniero_origen_idx on public.transferencias (ingeniero_origen);
create index transferencias_resuelta_por_idx on public.transferencias (resuelta_por);

-- ---------------------------------------------------------------------------
-- 5) Políticas RLS: se reescriben todas para envolver auth.uid() en
-- (select ...), y las "_admin FOR ALL" que duplicaban una acción ya cubierta
-- por otra política (SELECT/INSERT) se dividen para no evaluarse dos veces.
-- ---------------------------------------------------------------------------

-- usuarios
drop policy usuarios_select on public.usuarios;
drop policy usuarios_update_propio on public.usuarios;
drop policy usuarios_admin_all on public.usuarios;

create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = (select auth.uid()) or public.es_admin() or public.es_ingeniero_de(id));

create policy usuarios_update on public.usuarios
  for update to authenticated
  using (id = (select auth.uid()) or public.es_admin())
  with check (id = (select auth.uid()) or public.es_admin());

create policy usuarios_insert_admin on public.usuarios
  for insert to authenticated
  with check (public.es_admin());

create policy usuarios_delete_admin on public.usuarios
  for delete to authenticated
  using (public.es_admin());

-- ingenieros_becarios
drop policy ingenieros_becarios_select on public.ingenieros_becarios;
drop policy ingenieros_becarios_admin on public.ingenieros_becarios;

create policy ingenieros_becarios_select on public.ingenieros_becarios
  for select to authenticated
  using (
    becario_id = (select auth.uid())
    or ingeniero_id = (select auth.uid())
    or public.es_admin()
  );

create policy ingenieros_becarios_insert_admin on public.ingenieros_becarios
  for insert to authenticated
  with check (public.es_admin());

create policy ingenieros_becarios_update_admin on public.ingenieros_becarios
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy ingenieros_becarios_delete_admin on public.ingenieros_becarios
  for delete to authenticated
  using (public.es_admin());

-- enrolamientos_faciales
drop policy enrolamientos_select_propio on public.enrolamientos_faciales;
drop policy enrolamientos_insert_ingeniero on public.enrolamientos_faciales;
drop policy enrolamientos_update_ingeniero on public.enrolamientos_faciales;

create policy enrolamientos_select_propio on public.enrolamientos_faciales
  for select to authenticated
  using (becario_id = (select auth.uid()) or public.es_admin());

create policy enrolamientos_insert_ingeniero on public.enrolamientos_faciales
  for insert to authenticated
  with check (public.es_ingeniero_de(becario_id) or public.es_admin());

create policy enrolamientos_update_ingeniero on public.enrolamientos_faciales
  for update to authenticated
  using (public.es_ingeniero_de(becario_id) or public.es_admin())
  with check (public.es_ingeniero_de(becario_id) or public.es_admin());

-- asistencias
drop policy asistencias_select on public.asistencias;
drop policy asistencias_insert on public.asistencias;
drop policy asistencias_admin_write on public.asistencias;

create policy asistencias_select on public.asistencias
  for select to authenticated
  using (
    becario_id = (select auth.uid())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy asistencias_insert on public.asistencias
  for insert to authenticated
  with check (
    becario_id = (select auth.uid())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy asistencias_update_admin on public.asistencias
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy asistencias_delete_admin on public.asistencias
  for delete to authenticated
  using (public.es_admin());

-- horarios_modalidad
drop policy horarios_select on public.horarios_modalidad;
drop policy horarios_write on public.horarios_modalidad;

create policy horarios_select on public.horarios_modalidad
  for select to authenticated
  using (
    becario_id = (select auth.uid())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy horarios_insert on public.horarios_modalidad
  for insert to authenticated
  with check (public.es_ingeniero_de(becario_id) or public.es_admin());

create policy horarios_update on public.horarios_modalidad
  for update to authenticated
  using (public.es_ingeniero_de(becario_id) or public.es_admin())
  with check (public.es_ingeniero_de(becario_id) or public.es_admin());

create policy horarios_delete on public.horarios_modalidad
  for delete to authenticated
  using (public.es_ingeniero_de(becario_id) or public.es_admin());

-- metas_horas
drop policy metas_select on public.metas_horas;
drop policy metas_admin on public.metas_horas;

create policy metas_select on public.metas_horas
  for select to authenticated
  using (
    becario_id is null
    or becario_id = (select auth.uid())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy metas_insert_admin on public.metas_horas
  for insert to authenticated
  with check (public.es_admin());

create policy metas_update_admin on public.metas_horas
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy metas_delete_admin on public.metas_horas
  for delete to authenticated
  using (public.es_admin());

-- periodos_academicos
drop policy periodos_select on public.periodos_academicos;
drop policy periodos_admin on public.periodos_academicos;

create policy periodos_select on public.periodos_academicos
  for select to authenticated using (true);

create policy periodos_insert_admin on public.periodos_academicos
  for insert to authenticated
  with check (public.es_admin());

create policy periodos_update_admin on public.periodos_academicos
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy periodos_delete_admin on public.periodos_academicos
  for delete to authenticated
  using (public.es_admin());

-- reportes_siase
drop policy reportes_select on public.reportes_siase;
drop policy reportes_insert_propio on public.reportes_siase;
drop policy reportes_update on public.reportes_siase;

create policy reportes_select on public.reportes_siase
  for select to authenticated
  using (
    becario_id = (select auth.uid())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy reportes_insert_propio on public.reportes_siase
  for insert to authenticated
  with check (becario_id = (select auth.uid()) or public.es_admin());

create policy reportes_update on public.reportes_siase
  for update to authenticated
  using (
    becario_id = (select auth.uid())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  )
  with check (
    becario_id = (select auth.uid())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

-- transferencias
drop policy transferencias_select on public.transferencias;
drop policy transferencias_insert on public.transferencias;
drop policy transferencias_admin on public.transferencias;

create policy transferencias_select on public.transferencias
  for select to authenticated
  using (
    becario_id = (select auth.uid())
    or ingeniero_origen = (select auth.uid())
    or ingeniero_destino = (select auth.uid())
    or public.es_admin()
  );

create policy transferencias_insert on public.transferencias
  for insert to authenticated
  with check (
    (ingeniero_origen = (select auth.uid()) and public.es_ingeniero_de(becario_id))
    or public.es_admin()
  );

create policy transferencias_update_admin on public.transferencias
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy transferencias_delete_admin on public.transferencias
  for delete to authenticated
  using (public.es_admin());

-- ventana_siase
drop policy ventana_select on public.ventana_siase;
drop policy ventana_admin on public.ventana_siase;

create policy ventana_select on public.ventana_siase
  for select to authenticated using (true);

create policy ventana_insert_admin on public.ventana_siase
  for insert to authenticated
  with check (public.es_admin());

create policy ventana_update_admin on public.ventana_siase
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy ventana_delete_admin on public.ventana_siase
  for delete to authenticated
  using (public.es_admin());
