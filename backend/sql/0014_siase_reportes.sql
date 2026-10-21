-- Corrección de auditoría · 0014 — Reportes SIASE
-- Hallazgos: A-01 (el becario podía auto-confirmarse y re-subir borraba la firma),
-- A-02 (se guardaba una URL firmada que caduca a las 24 h), A-03 (reportes de
-- meses anteriores desaparecían de la vista de firma), A-04 (sin pg_cron nadie
-- quedaba en "sin_reporte"), M-04 (estado distinto según el perfil), M-16 (excluir).

-- ---------------------------------------------------------------------------
-- A-02: archivo_url guarda ahora la RUTA del objeto en el bucket "siase"
-- ("<becario>/<mes>/<archivo>"); la app genera la URL firmada al abrirlo.
-- Se convierten las URLs firmadas que hubiera (al aplicar esto había 0 filas).
-- Va antes del trigger de abajo para que no lo bloquee.
-- ---------------------------------------------------------------------------
update public.reportes_siase
set archivo_url = regexp_replace(archivo_url, '^.*/object/sign/siase/([^?]+).*$', '\1')
where archivo_url like 'http%';

comment on column public.reportes_siase.archivo_url is
  'Ruta del objeto en el bucket siase (<becario_id>/<mes>/<archivo>), NO una URL. La app firma una URL temporal al abrirlo.';

-- ---------------------------------------------------------------------------
-- A-01: el becario (quien no es ingeniero asignado ni admin) solo puede
-- crear/reemplazar su reporte del mes en curso, con la ventana abierta, y solo
-- mientras siga en pendiente/subido. No puede tocar estado de firma.
-- Las llamadas sin usuario (service_role, jobs, migraciones) pasan.
-- ---------------------------------------------------------------------------
create or replace function public.proteger_reporte_siase()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_abierta boolean;
begin
  if (select auth.uid()) is null
     or public.es_admin()
     or public.es_ingeniero_de(new.becario_id) then
    return new;
  end if;

  if not public.usuario_activo() then
    raise exception 'Tu cuenta está inactiva; no puedes subir reportes.';
  end if;

  if new.estado not in ('pendiente', 'subido')
     or new.firmado_por is not null
     or new.fecha_firma is not null then
    raise exception 'Solo tu ingeniero o la coordinación pueden confirmar un reporte.';
  end if;

  if tg_op = 'UPDATE' then
    if old.estado not in ('pendiente', 'subido') then
      raise exception 'Este reporte ya fue revisado; ya no se puede reemplazar.';
    end if;
    if new.becario_id <> old.becario_id or new.mes <> old.mes or new.periodo_id <> old.periodo_id then
      raise exception 'No se puede cambiar el mes ni el periodo de un reporte.';
    end if;
  end if;

  select e.abierta into v_abierta from public.estado_ventana_siase(public.hoy_local()) e;
  if not coalesce(v_abierta, false)
     or new.mes <> date_trunc('month', public.hoy_local())::date then
    raise exception 'La ventana para subir el reporte SIASE está cerrada.';
  end if;

  return new;
end;
$$;

revoke execute on function public.proteger_reporte_siase() from public, anon, authenticated;

create trigger reportes_siase_proteger
  before insert or update on public.reportes_siase
  for each row execute function public.proteger_reporte_siase();

-- ---------------------------------------------------------------------------
-- Storage: el becario no puede sobrescribir el archivo de un mes ya revisado.
-- ---------------------------------------------------------------------------
drop policy siase_insert on storage.objects;
drop policy siase_update on storage.objects;

create policy siase_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'siase'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.usuario_activo()
    and not exists (
      select 1 from public.reportes_siase r
      where r.becario_id = (select auth.uid())
        and r.mes::text = (storage.foldername(name))[2]
        and r.estado in ('confirmado', 'excluido', 'sin_reporte')
    )
  );

create policy siase_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'siase'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'siase'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.usuario_activo()
    and not exists (
      select 1 from public.reportes_siase r
      where r.becario_id = (select auth.uid())
        and r.mes::text = (storage.foldername(name))[2]
        and r.estado in ('confirmado', 'excluido', 'sin_reporte')
    )
  );

-- ---------------------------------------------------------------------------
-- A-04 / M-04: estado EFECTIVO de cada becario activo para un mes, sin
-- depender de pg_cron. Regla única para los tres perfiles:
--   * hay fila y no está en 'pendiente'  → el estado de la fila;
--   * no hay fila (o está 'pendiente') y ya pasó el día de cierre de ese mes
--     (hora local) → 'sin_reporte';
--   * si no → 'pendiente'.
-- SECURITY INVOKER: el RLS de usuarios decide qué filas ve cada quien
-- (becario: la suya; ingeniero: su equipo; admin: todos).
-- ---------------------------------------------------------------------------
create or replace function public.reportes_siase_mes(
  p_mes date default date_trunc('month', public.hoy_local())::date
)
returns table (
  becario_id    uuid,
  nombre        text,
  matricula     text,
  reporte_id    uuid,
  mes           date,
  archivo_ruta  text,
  estado        public.estado_reporte_siase,
  fecha_firma   timestamptz,
  firmado_por   uuid,
  actualizado   timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  with m as (
    select date_trunc('month', p_mes)::date as mes,
           (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as ultimo
  ),
  cierre as (
    select make_date(
             extract(year from m.mes)::int,
             extract(month from m.mes)::int,
             least(v.dia_cierre, extract(day from m.ultimo)::int)
           ) as dia
    from m cross join public.ventana_siase v
    limit 1
  )
  select
    u.id,
    u.nombre,
    u.matricula,
    r.id,
    (select mes from m),
    r.archivo_url,
    case
      when r.id is not null and r.estado <> 'pendiente' then r.estado
      when public.hoy_local() > coalesce((select dia from cierre), (select ultimo from m))
        then 'sin_reporte'::public.estado_reporte_siase
      else 'pendiente'::public.estado_reporte_siase
    end,
    r.fecha_firma,
    r.firmado_por,
    r.updated_at
  from public.usuarios u
  left join public.reportes_siase r
    on r.becario_id = u.id and r.mes = (select mes from m)
  where u.perfil = 'becario'
    and u.estado = 'activo'
  order by u.nombre;
$$;

-- ---------------------------------------------------------------------------
-- Firma / exclusión en una sola llamada. Quien firma y cuándo los pone el
-- servidor (antes los mandaba el cliente). Solo cambia filas en estado válido,
-- así que un doble toque o dos firmantes a la vez no se pisan.
-- Devuelve cuántas filas cambió.
-- ---------------------------------------------------------------------------
create or replace function public.firmar_reportes_siase(
  p_ids    uuid[],
  p_estado public.estado_reporte_siase default 'confirmado'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cambiados integer;
begin
  if p_estado not in ('confirmado', 'excluido') then
    raise exception 'Acción no válida para un reporte.';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos un reporte.';
  end if;
  if not public.es_admin() and exists (
    select 1 from public.reportes_siase r
    where r.id = any (p_ids) and not public.es_ingeniero_de(r.becario_id)
  ) then
    raise exception 'Solo puedes firmar reportes de tus propios becarios.';
  end if;

  update public.reportes_siase r
  set estado = p_estado,
      firmado_por = (select auth.uid()),
      fecha_firma = now()
  where r.id = any (p_ids)
    and (
      r.estado = 'subido'
      or (p_estado = 'excluido' and r.estado in ('pendiente', 'sin_reporte'))
    );

  get diagnostics v_cambiados = row_count;
  return v_cambiados;
end;
$$;

revoke execute on function public.reportes_siase_mes(date) from public, anon;
revoke execute on function public.firmar_reportes_siase(uuid[], public.estado_reporte_siase) from public, anon;
grant execute on function public.reportes_siase_mes(date) to authenticated;
grant execute on function public.firmar_reportes_siase(uuid[], public.estado_reporte_siase) to authenticated;
