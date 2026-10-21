-- Fase 2 · 0004 — Row Level Security por perfil
-- "Un becario solo lee sus propias filas, un ingeniero lee las de sus becarios
-- asignados, y el administrador lee todo." (plan, sección Base de datos)

alter table public.usuarios                enable row level security;
alter table public.ingenieros_becarios     enable row level security;
alter table public.enrolamientos_faciales  enable row level security;
alter table public.asistencias             enable row level security;
alter table public.horarios_modalidad      enable row level security;
alter table public.metas_horas             enable row level security;
alter table public.periodos_academicos     enable row level security;
alter table public.reportes_siase          enable row level security;
alter table public.transferencias          enable row level security;
alter table public.ventana_siase           enable row level security;

-- Nadie anónimo toca nada; todo pasa por una sesión autenticada.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- usuarios
-- ---------------------------------------------------------------------------
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = auth.uid()
    or public.es_admin()
    or public.es_ingeniero_de(id)
  );

-- El propio usuario puede editar su cuenta, pero no ascenderse de perfil:
-- perfil y estado quedan bloqueados por el trigger de abajo.
create policy usuarios_update_propio on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy usuarios_admin_all on public.usuarios
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create or replace function public.proteger_campos_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.es_admin() then
    return new;
  end if;
  if new.perfil is distinct from old.perfil
     or new.estado is distinct from old.estado
     or new.matricula is distinct from old.matricula then
    raise exception 'Solo un administrador puede cambiar perfil, estado o matricula';
  end if;
  return new;
end;
$$;

create trigger usuarios_proteger_campos
  before update on public.usuarios
  for each row execute function public.proteger_campos_usuario();

-- ---------------------------------------------------------------------------
-- ingenieros_becarios — la asignación la hace el administrador.
-- ---------------------------------------------------------------------------
create policy ingenieros_becarios_select on public.ingenieros_becarios
  for select to authenticated
  using (
    becario_id = auth.uid()
    or ingeniero_id = auth.uid()
    or public.es_admin()
  );

create policy ingenieros_becarios_admin on public.ingenieros_becarios
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- enrolamientos_faciales — dato biométrico.
-- El becario lee SOLO el suyo (la verificación corre en su dispositivo).
-- El ingeniero puede enrolar a los suyos, pero no leer el vector de nadie.
-- ---------------------------------------------------------------------------
create policy enrolamientos_select_propio on public.enrolamientos_faciales
  for select to authenticated
  using (becario_id = auth.uid() or public.es_admin());

create policy enrolamientos_insert_ingeniero on public.enrolamientos_faciales
  for insert to authenticated
  with check (
    public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy enrolamientos_update_ingeniero on public.enrolamientos_faciales
  for update to authenticated
  using (public.es_ingeniero_de(becario_id) or public.es_admin())
  with check (public.es_ingeniero_de(becario_id) or public.es_admin());

-- ---------------------------------------------------------------------------
-- asistencias — el becario registra la suya; nadie edita el histórico salvo admin.
-- ---------------------------------------------------------------------------
create policy asistencias_select on public.asistencias
  for select to authenticated
  using (
    becario_id = auth.uid()
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy asistencias_insert on public.asistencias
  for insert to authenticated
  with check (
    becario_id = auth.uid()
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy asistencias_admin_write on public.asistencias
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- horarios_modalidad — lo configura el ingeniero, lo consulta el becario.
-- ---------------------------------------------------------------------------
create policy horarios_select on public.horarios_modalidad
  for select to authenticated
  using (
    becario_id = auth.uid()
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy horarios_write on public.horarios_modalidad
  for all to authenticated
  using (public.es_ingeniero_de(becario_id) or public.es_admin())
  with check (public.es_ingeniero_de(becario_id) or public.es_admin());

-- ---------------------------------------------------------------------------
-- metas_horas — las edita el administrador (Configuración).
-- ---------------------------------------------------------------------------
create policy metas_select on public.metas_horas
  for select to authenticated
  using (
    becario_id is null
    or becario_id = auth.uid()
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy metas_admin on public.metas_horas
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- periodos_academicos — todos los leen, solo admin abre/cierra.
-- ---------------------------------------------------------------------------
create policy periodos_select on public.periodos_academicos
  for select to authenticated using (true);

create policy periodos_admin on public.periodos_academicos
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- reportes_siase — el becario sube el suyo, el ingeniero lo firma.
-- ---------------------------------------------------------------------------
create policy reportes_select on public.reportes_siase
  for select to authenticated
  using (
    becario_id = auth.uid()
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy reportes_insert_propio on public.reportes_siase
  for insert to authenticated
  with check (becario_id = auth.uid() or public.es_admin());

create policy reportes_update on public.reportes_siase
  for update to authenticated
  using (
    becario_id = auth.uid()
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  )
  with check (
    becario_id = auth.uid()
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

-- ---------------------------------------------------------------------------
-- transferencias — la solicita el ingeniero, la resuelve el administrador.
-- ---------------------------------------------------------------------------
create policy transferencias_select on public.transferencias
  for select to authenticated
  using (
    becario_id = auth.uid()
    or ingeniero_origen = auth.uid()
    or ingeniero_destino = auth.uid()
    or public.es_admin()
  );

create policy transferencias_insert on public.transferencias
  for insert to authenticated
  with check (
    (ingeniero_origen = auth.uid() and public.es_ingeniero_de(becario_id))
    or public.es_admin()
  );

create policy transferencias_admin on public.transferencias
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- ventana_siase — config global de lectura para todos.
-- ---------------------------------------------------------------------------
create policy ventana_select on public.ventana_siase
  for select to authenticated using (true);

create policy ventana_admin on public.ventana_siase
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());
