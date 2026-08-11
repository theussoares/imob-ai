-- Buckets públicos (leitura livre; escrita apenas por usuários autenticados/membros)
insert into storage.buckets (id, name, public)
values
  ('property-images', 'property-images', true),
  ('tenant-logos', 'tenant-logos', true)
on conflict (id) do nothing;

create policy "auth upload property-images" on storage.objects
  for insert to authenticated with check (bucket_id = 'property-images');
create policy "auth update property-images" on storage.objects
  for update to authenticated using (bucket_id = 'property-images');
create policy "auth delete property-images" on storage.objects
  for delete to authenticated using (bucket_id = 'property-images');
create policy "auth upload tenant-logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'tenant-logos');
create policy "auth update tenant-logos" on storage.objects
  for update to authenticated using (bucket_id = 'tenant-logos');
create policy "auth delete tenant-logos" on storage.objects
  for delete to authenticated using (bucket_id = 'tenant-logos');
