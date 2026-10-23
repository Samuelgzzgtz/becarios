-- 0019 — Firma del webhook de Clerk guardada en Supabase Vault (cifrada).
--
-- clerk-webhook verifica la firma Svix con este secreto. Se lee primero de la
-- variable de entorno CLERK_WEBHOOK_SIGNING_SECRET y, si no existe, de Vault con
-- secreto_webhook_clerk(). Ambas funciones solo las puede ejecutar service_role.

create or replace function public.guardar_secreto_webhook_clerk(p_secreto text)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_secreto is null or p_secreto not like 'whsec\_%' then
    raise exception 'Secreto de webhook no válido';
  end if;
  select id into v_id from vault.secrets where name = 'clerk_webhook_signing_secret';
  if v_id is null then
    perform vault.create_secret(p_secreto, 'clerk_webhook_signing_secret', 'Firma del webhook de Clerk (clerk-webhook)');
  else
    perform vault.update_secret(v_id, p_secreto);
  end if;
end;
$$;

create or replace function public.secreto_webhook_clerk()
returns text
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'clerk_webhook_signing_secret' limit 1;
$$;

revoke execute on function public.guardar_secreto_webhook_clerk(text) from public, anon, authenticated;
revoke execute on function public.secreto_webhook_clerk() from public, anon, authenticated;
grant execute on function public.guardar_secreto_webhook_clerk(text) to service_role;
grant execute on function public.secreto_webhook_clerk() to service_role;
