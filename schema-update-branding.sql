-- ============================================================
-- NEXO — atualização: bucket de marca (logo por projeto)
-- Rode isto UMA VEZ, além do schema.sql já executado antes.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "usuário envia sua própria marca" on storage.objects;
create policy "usuário envia sua própria marca" on storage.objects for insert
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "usuário apaga sua própria marca" on storage.objects;
create policy "usuário apaga sua própria marca" on storage.objects for delete
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "qualquer um lê a marca (bucket público)" on storage.objects;
create policy "qualquer um lê a marca (bucket público)" on storage.objects for select
  using (bucket_id = 'branding');
