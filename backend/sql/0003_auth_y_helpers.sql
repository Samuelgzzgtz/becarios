-- Fase 2 · 0003 — Trigger de alta de usuario y helpers de RLS
-- Plan, "Backend" punto 1.

-- ---------------------------------------------------------------------------
-- Helpers. Van en SECURITY DEFINER a propósito: si una política sobre
-- public.usuarios consultara public.usuarios directamente, Postgres entraría
-- en recursión infinita al evaluar la propia política.
-- ---------------------------------------------------------------------------
create or replace function public.perfil_actual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.perfil from public.usuarios u where u.id = auth.uid();
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
    where u.id = auth.uid()
      and u.perfil = 'administrador'
      and u.estado = 'activo'
  );
$$;

-- ¿El usuario autenticado es el ingeniero asignado de este becario?
create or replace function public.es_ingeniero_de(p_becario uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ingenieros_becarios ib
    where ib.ingeniero_id = auth.uid()
      and ib.becario_id = p_becario
      and ib.activo
  );
$$;

revoke execute on function public.perfil_actual() from anon;
revoke execute on function public.es_admin() from anon;
revoke execute on function public.es_ingeniero_de(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Alta automática en public.usuarios cuando nace un auth.users.
-- El perfil llega en el metadata del signup; sin él, entra como becario.
-- ---------------------------------------------------------------------------
create or replace function public.manejar_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfil_usuario;
begin
  begin
    v_perfil := coalesce(
      (new.raw_user_meta_data ->> 'perfil')::public.perfil_usuario,
      'becario'
    );
  exception when invalid_text_representation then
    v_perfil := 'becario';
  end;

  insert into public.usuarios (id, matricula, nombre, perfil, coordinacion)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'matricula', new.id::text),
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    v_perfil,
    new.raw_user_meta_data ->> 'coordinacion'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.manejar_nuevo_usuario();
