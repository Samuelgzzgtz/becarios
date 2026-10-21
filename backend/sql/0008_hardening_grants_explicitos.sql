-- Fase 2 · 0008 — Revocar grants explícitos a anon/authenticated
-- que 0007 no tocó. Supabase concede EXECUTE a anon y authenticated por
-- default privileges al crear la función; revocar solo de PUBLIC no
-- alcanza cuando el grant es directo al rol, no heredado de PUBLIC.
-- Confirmado consultando pg_proc.proacl.

revoke execute on function public.manejar_nuevo_usuario() from anon, authenticated;
revoke execute on function public.proteger_campos_usuario() from anon, authenticated;
revoke execute on function public.tocar_updated_at() from anon, authenticated;
