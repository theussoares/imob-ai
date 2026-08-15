-- Isolamento de storage por tenant.
--
-- As policies de 0003 e 0007 só checavam `bucket_id` para o papel `authenticated`:
-- qualquer admin logado podia apagar ou sobrescrever arquivos de QUALQUER tenant
-- (ex.: trocar a foto do hero de um concorrente, ou deixar o site dele com
-- <img> quebrado). Agora cada operação exige que a primeira pasta do path seja o
-- slug de um tenant do qual o usuário é membro.
--
-- Os três buckets já gravam com o slug na frente:
--   property-images: <slug>/<timestamp>-<rand>.<ext>
--   tenant-logos:    <slug>/logo-<timestamp>.<ext>
--   tenant-hero:     <slug>/hero-<timestamp>.<ext>

create or replace function public.is_member_of_slug(folder text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tenants t
    join public.tenant_members m on m.tenant_id = t.id
    where m.user_id = auth.uid()
      and t.slug = folder
  );
$$;

-- property-images -----------------------------------------------------------
drop policy if exists "auth upload property-images" on storage.objects;
create policy "auth upload property-images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-images' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "auth update property-images" on storage.objects;
create policy "auth update property-images" on storage.objects
  for update to authenticated
  using (bucket_id = 'property-images' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "auth delete property-images" on storage.objects;
create policy "auth delete property-images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-images' and public.is_member_of_slug((storage.foldername(name))[1]));

-- tenant-logos --------------------------------------------------------------
drop policy if exists "auth upload tenant-logos" on storage.objects;
create policy "auth upload tenant-logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tenant-logos' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "auth update tenant-logos" on storage.objects;
create policy "auth update tenant-logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'tenant-logos' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "auth delete tenant-logos" on storage.objects;
create policy "auth delete tenant-logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tenant-logos' and public.is_member_of_slug((storage.foldername(name))[1]));

-- tenant-hero ---------------------------------------------------------------
drop policy if exists "auth upload tenant-hero" on storage.objects;
create policy "auth upload tenant-hero" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tenant-hero' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "auth update tenant-hero" on storage.objects;
create policy "auth update tenant-hero" on storage.objects
  for update to authenticated
  using (bucket_id = 'tenant-hero' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "auth delete tenant-hero" on storage.objects;
create policy "auth delete tenant-hero" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tenant-hero' and public.is_member_of_slug((storage.foldername(name))[1]));
