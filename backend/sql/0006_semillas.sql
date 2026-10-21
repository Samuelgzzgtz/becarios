-- Fase 2 · 0006 — Configuración inicial y job programado
-- No incluye usuarios de prueba: esos nacen del signup de Auth (ver README).

-- Ventana SIASE del día 26 al 30 (plan, "Backend" punto 3).
insert into public.ventana_siase (id, dia_apertura, dia_cierre)
values (true, 26, 30)
on conflict (id) do nothing;

-- Metas globales por defecto; el administrador las ajusta en Configuración.
insert into public.metas_horas (becario_id, meta_semanal, meta_mensual, meta_semestral)
select null, 20, 80, 480
where not exists (select 1 from public.metas_horas where becario_id is null);

-- Periodo académico inicial.
insert into public.periodos_academicos (nombre, tipo, fecha_inicio, fecha_fin, activo)
select 'Agosto-Diciembre 2026', 'AD', date '2026-08-03', date '2026-12-04', true
where not exists (select 1 from public.periodos_academicos where activo);

-- ---------------------------------------------------------------------------
-- Job programado que cierra la ventana SIASE.
-- Requiere la extensión pg_cron (Supabase: Database → Extensions → pg_cron).
-- Descomentar una vez habilitada.
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron;
--
-- select cron.schedule(
--   'cerrar-ventana-siase',
--   '5 0 1 * *',  -- 00:05 del día 1, ya cerrada la ventana del mes anterior
--   $$select public.cerrar_ventana_siase((date_trunc('month', current_date) - interval '1 month')::date)$$
-- );
