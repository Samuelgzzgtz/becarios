-- Orden de webhooks de Clerk y permisos tras cambiar de perfil.
create table public.clerk_sincronizacion (
  clerk_id text primary key,
  actualizado_en bigint not null,
  eliminado boolean not null default false
);
alter table public.clerk_sincronizacion enable row level security;
revoke all on public.clerk_sincronizacion from public, anon, authenticated;

drop function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text);
drop function public.desactivar_usuario_clerk(text);

create or replace function public.es_ingeniero_de(p_becario uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ingenieros_becarios ib
    join public.usuarios u on u.id = ib.ingeniero_id
    where ib.ingeniero_id = (select public.uid_actual())
      and ib.becario_id = p_becario and ib.activo
      and u.estado = 'activo' and u.perfil = 'ingeniero'
  );
$$;

create or replace function public.sincronizar_usuario_clerk(
  p_clerk_id text,
  p_email text,
  p_nombre text,
  p_perfil text,
  p_matricula text,
  p_coordinacion text,
  p_bloqueado boolean,
  p_estado text default null,
  p_actualizado_en bigint default 0
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
  -- La fila serializa entregas concurrentes; un evento viejo no restaura acceso.
  insert into public.clerk_sincronizacion as actual (clerk_id, actualizado_en, eliminado)
  values (p_clerk_id, p_actualizado_en, false)
  on conflict (clerk_id) do update set actualizado_en = excluded.actualizado_en
  where not actual.eliminado and actual.actualizado_en < excluded.actualizado_en;
  if not found then
    select id into v_id from public.usuarios where clerk_id = p_clerk_id;
    return v_id;
  end if;
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

revoke execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text, bigint) from public, anon, authenticated;
grant execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text, bigint) to service_role;

/* Usuario eliminado en Clerk: se conserva su historial, pero pierde el acceso. */
create or replace function public.desactivar_usuario_clerk(p_clerk_id text, p_actualizado_en bigint default 0)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Eliminar es definitivo para este id de Clerk, incluso si llega antes del alta.
  insert into public.clerk_sincronizacion as actual (clerk_id, actualizado_en, eliminado)
  values (p_clerk_id, p_actualizado_en, true)
  on conflict (clerk_id) do update
    set actualizado_en = greatest(actual.actualizado_en, excluded.actualizado_en), eliminado = true;
  perform set_config('docencheck.sincronizando_clerk', 'on', true);
  update public.usuarios set estado = 'inactivo' where clerk_id = p_clerk_id;
end;
$$;

revoke execute on function public.desactivar_usuario_clerk(text, bigint) from public, anon, authenticated;
grant execute on function public.desactivar_usuario_clerk(text, bigint) to service_role;
