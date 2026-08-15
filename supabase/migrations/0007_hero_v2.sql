-- Hero v2: imagem configurável ao lado do texto (split-screen), com CTA opcional.
-- 4 colunas novas em tenants, todas opcionais — tenants existentes sem hero_image
-- continuam caindo no hero só-texto (fallback tratado na aplicação).

alter table public.tenants
  add column if not exists hero_image text,
  add column if not exists hero_image_position text not null default 'right',
  add column if not exists hero_cta_label text,
  add column if not exists hero_cta_href text;

-- drop antes do add: Postgres não tem "add constraint if not exists", e sem isso
-- reaplicar as migrations trava aqui e as seguintes (0008, 0009) não rodam.
alter table public.tenants drop constraint if exists tenants_hero_image_position_check;
alter table public.tenants
  add constraint tenants_hero_image_position_check
  check (hero_image_position in ('left', 'right'));

-- Bucket de storage pras fotos do hero (espelha o tenant-logos existente).
insert into storage.buckets (id, name, public)
values ('tenant-hero', 'tenant-hero', true)
on conflict (id) do nothing;

drop policy if exists "auth upload tenant-hero" on storage.objects;
create policy "auth upload tenant-hero" on storage.objects
  for insert to authenticated with check (bucket_id = 'tenant-hero');
drop policy if exists "auth update tenant-hero" on storage.objects;
create policy "auth update tenant-hero" on storage.objects
  for update to authenticated using (bucket_id = 'tenant-hero');
drop policy if exists "auth delete tenant-hero" on storage.objects;
create policy "auth delete tenant-hero" on storage.objects
  for delete to authenticated using (bucket_id = 'tenant-hero');
