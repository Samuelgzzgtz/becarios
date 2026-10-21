-- Fase 3 · 0010 — Bucket de Storage para los reportes SIASE
-- El SiaseRepository de la app sube a la ruta "<becario_id>/<mes>/<archivo>",
-- así que las políticas usan el primer segmento de la ruta como el becario_id.

insert into storage.buckets (id, name, public)
values ('siase', 'siase', false)
on conflict (id) do nothing;

create policy siase_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'siase'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.es_ingeniero_de(((storage.foldername(name))[1])::uuid)
      or public.es_admin()
    )
  );

create policy siase_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'siase'
    and (storage.foldername(name))[1] = (select auth.uid())::text
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
  );
