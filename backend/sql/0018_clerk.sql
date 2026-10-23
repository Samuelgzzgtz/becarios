-- 0018 — Login con Clerk (Supabase Third-Party Auth) en lugar de Supabase Auth.
--
-- Con Clerk, el JWT trae sub = 'user_2abc…' (texto, no uuid): auth.uid() deja de
-- servir. Los usuarios conservan su id uuid (y todo su historial); el id de Clerk
-- se guarda aparte en usuarios.clerk_id y public.uid_actual() hace la traducción.
--
-- Pasos:
--  1. usuarios.clerk_id y usuarios.email; el id ya no depende de auth.users.
--  2. public.uid_actual(): el uuid del usuario de la sesión de Clerk.
--  3. Todas las políticas RLS y funciones que usaban auth.uid() pasan a uid_actual().
--  4. sincronizar_usuario_clerk(): la llama SOLO el webhook de Clerk (service_role)
--     para crear/enlazar/actualizar cuentas. Un usuario nuevo sin perfil en Clerk
--     queda 'inactivo' hasta que el administrador le asigna el perfil (dar acceso).
--
-- Todo va en una sola transacción: si algo falla, no queda a medias.

-- ---------------------------------------------------------------------------
-- 1) Columnas de enlace con Clerk
-- ---------------------------------------------------------------------------
alter table public.usuarios add column if not exists clerk_id text unique;
alter table public.usuarios add column if not exists email text;

-- El correo de las cuentas existentes, para enlazarlas por correo al entrar con Clerk.
update public.usuarios u
set email = lower(a.email)
from auth.users a
where a.id = u.id and u.email is null;

create unique index if not exists usuarios_email_idx on public.usuarios (lower(email)) where email is not null;

-- Las cuentas nuevas ya no nacen en auth.users.
alter table public.usuarios drop constraint if exists usuarios_id_fkey;
alter table public.usuarios alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------------------
-- 2) Identidad de la sesión
-- ---------------------------------------------------------------------------
create or replace function public.uid_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id from public.usuarios u where u.clerk_id = (select auth.jwt() ->> 'sub');
$$;

revoke execute on function public.uid_actual() from public, anon;
grant execute on function public.uid_actual() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) auth.uid() → public.uid_actual() en políticas y funciones
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_def text;
  v_sql text;
begin
  -- Funciones de public (helpers de RLS, RPC transaccionales, triggers).
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'uid_actual'
      and p.prosrc ilike '%auth.uid()%'
  loop
    v_def := replace(pg_get_functiondef(r.oid), 'auth.uid()', 'public.uid_actual()');
    execute v_def;
  end loop;

  -- Políticas RLS de public y de Storage (bucket siase).
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') ilike '%auth.uid()%' or coalesce(with_check, '') ilike '%auth.uid()%')
  loop
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      v_sql := v_sql || ' using (' || replace(r.qual, 'auth.uid()', 'public.uid_actual()') || ')';
    end if;
    if r.with_check is not null then
      v_sql := v_sql || ' with check (' || replace(r.with_check, 'auth.uid()', 'public.uid_actual()') || ')';
    end if;
    execute v_sql;
  end loop;

  -- Verificación: no debe quedar nada usando auth.uid().
  if exists (
    select 1 from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') ilike '%auth.uid()%' or coalesce(with_check, '') ilike '%auth.uid()%')
  ) or exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ilike '%auth.uid()%'
  ) then
    raise exception 'Quedaron políticas o funciones con auth.uid()';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Sincronización desde el webhook de Clerk
-- ---------------------------------------------------------------------------

-- El trigger que protege perfil/estado/matrícula deja pasar la sincronización.
create or replace function public.proteger_campos_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.es_admin() or current_setting('docencheck.sincronizando_clerk', true) = 'on' then
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

/*
 * Crea, enlaza o actualiza la cuenta de un usuario de Clerk.
 *  - Busca por clerk_id; si no, por correo (enlaza una cuenta existente y
 *    conserva su historial); si no, crea una nueva.
 *  - p_perfil: el perfil puesto en el public metadata de Clerk. null = sin acceso.
 *    Una cuenta NUEVA sin perfil queda 'inactivo'; una existente conserva el suyo.
 *  - p_bloqueado: bloqueado o eliminado en Clerk → 'inactivo'.
 *  - p_estado: 'egresado' opcional desde el metadata.
 */
create or replace function public.sincronizar_usuario_clerk(
  p_clerk_id text,
  p_email text,
  p_nombre text,
  p_perfil text,
  p_matricula text,
  p_coordinacion text,
  p_bloqueado boolean,
  p_estado text default null
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
  v_email text := nullif(lower(trim(p_email)), '');
begin
  perform set_config('docencheck.sincronizando_clerk', 'on', true);

  begin
    v_perfil := nullif(trim(p_perfil), '')::public.perfil_usuario;
  exception when invalid_text_representation then
    v_perfil := null;
  end;

  select id into v_id from public.usuarios where clerk_id = p_clerk_id;
  if v_id is null and v_email is not null then
    select id into v_id from public.usuarios where lower(email) = v_email and clerk_id is null;
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

revoke execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text) to service_role;

/* Usuario eliminado en Clerk: se conserva su historial, pero pierde el acceso. */
create or replace function public.desactivar_usuario_clerk(p_clerk_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('docencheck.sincronizando_clerk', 'on', true);
  update public.usuarios set estado = 'inactivo' where clerk_id = p_clerk_id;
end;
$$;

revoke execute on function public.desactivar_usuario_clerk(text) from public, anon, authenticated;
grant execute on function public.desactivar_usuario_clerk(text) to service_role;
