-- QA en emulador · 0017 — Un becario puede ver a SU ingeniero asignado
-- Encontrado probando "Mi cuenta" del becario: "Ingeniero asignado" salía
-- "Sin asignar" aunque había una asignación activa. ingenieros_becarios sí era
-- visible para el becario, pero usuarios_select no le dejaba leer la fila del
-- ingeniero, así que el lookup devolvía null.

create or replace function public.es_mi_ingeniero(p_ingeniero uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ingenieros_becarios ib
    where ib.becario_id = (select auth.uid())
      and ib.ingeniero_id = p_ingeniero
      and ib.activo
  );
$$;

revoke all on function public.es_mi_ingeniero(uuid) from public, anon;
grant execute on function public.es_mi_ingeniero(uuid) to authenticated;

drop policy usuarios_select on public.usuarios;

create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.es_admin()
    or public.es_ingeniero_de(id)
    or (perfil = 'ingeniero' and public.perfil_actual() = 'ingeniero')
    or (perfil = 'ingeniero' and public.es_mi_ingeniero(id))
  );
