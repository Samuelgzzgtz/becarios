-- Corrección de auditoría · 0013 — Integridad de asistencias y usuarios inactivos
-- Hallazgos: C-03 (doble toque crea dos registros), C-04 (corrección manual),
-- A-13 (un usuario dado de baja sigue registrando).

-- ---------------------------------------------------------------------------
-- ¿El usuario autenticado está activo? SECURITY DEFINER por la misma razón
-- que es_admin(): se usa dentro de políticas de otras tablas.
-- ---------------------------------------------------------------------------
create or replace function public.usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid())
      and u.estado = 'activo'
  );
$$;

-- Un ingeniero dado de baja deja de tener acceso a su antiguo equipo.
create or replace function public.es_ingeniero_de(p_becario uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ingenieros_becarios ib
    join public.usuarios u on u.id = ib.ingeniero_id
    where ib.ingeniero_id = (select auth.uid())
      and ib.becario_id = p_becario
      and ib.activo
      and u.estado = 'activo'
  );
$$;

revoke execute on function public.usuario_activo() from public, anon;
grant execute on function public.usuario_activo() to authenticated;

-- ---------------------------------------------------------------------------
-- Políticas de asistencias:
--  * insert del propio becario solo si su cuenta está activa;
--  * el ingeniero asignado (además del admin) puede corregir: editar o borrar
--    un registro equivocado (p. ej. la salida que el becario olvidó).
-- ---------------------------------------------------------------------------
drop policy asistencias_insert on public.asistencias;
drop policy asistencias_update_admin on public.asistencias;
drop policy asistencias_delete_admin on public.asistencias;

create policy asistencias_insert on public.asistencias
  for insert to authenticated
  with check (
    (becario_id = (select auth.uid()) and public.usuario_activo())
    or public.es_ingeniero_de(becario_id)
    or public.es_admin()
  );

create policy asistencias_update on public.asistencias
  for update to authenticated
  using (public.es_ingeniero_de(becario_id) or public.es_admin())
  with check (public.es_ingeniero_de(becario_id) or public.es_admin());

create policy asistencias_delete on public.asistencias
  for delete to authenticated
  using (public.es_ingeniero_de(becario_id) or public.es_admin());

-- ---------------------------------------------------------------------------
-- Anti-duplicado: dos registros del mismo becario a menos de 1 minuto entre sí
-- son un doble toque (o un reintento de sincronización cuyo primer intento sí
-- llegó). El advisory lock por becario serializa inserciones concurrentes, que
-- es justo el caso del doble toque. El HINT "asistencia_duplicada" permite al
-- cliente distinguir este rechazo (la cola offline lo trata como "ya subido").
-- ---------------------------------------------------------------------------
create or replace function public.validar_asistencia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.becario_id::text, 0));

  if exists (
    select 1 from public.asistencias a
    where a.becario_id = new.becario_id
      and a.id <> new.id
      and a.ocurrido_en > new.ocurrido_en - interval '1 minute'
      and a.ocurrido_en < new.ocurrido_en + interval '1 minute'
  ) then
    raise exception 'Ya hay un registro de asistencia de hace menos de un minuto; no se duplicó.'
      using errcode = 'P0001', hint = 'asistencia_duplicada';
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_asistencia() from public, anon, authenticated;

create trigger asistencias_validar
  before insert on public.asistencias
  for each row execute function public.validar_asistencia();
