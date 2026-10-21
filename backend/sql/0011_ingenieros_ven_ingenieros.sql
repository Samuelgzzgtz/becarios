-- Fase 4 · 0011 — Un ingeniero puede ver a otros ingenieros
-- Encontrado probando "Solicitar transferencia" en dispositivo real: la lista
-- de ingenieros destino salía vacía porque usuarios_select solo dejaba ver la
-- propia fila, becarios asignados, o admin — nunca a otro ingeniero.

drop policy usuarios_select on public.usuarios;

create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.es_admin()
    or public.es_ingeniero_de(id)
    or (perfil = 'ingeniero' and public.perfil_actual() = 'ingeniero')
  );
