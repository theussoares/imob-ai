-- ⚠️ IMPORTADA DA PRODUÇÃO — não foi escrita aqui.
--
-- Aplicada direto no banco em 2026-09-09, sem nunca
-- ter sido commitada. Recuperada de `supabase_migrations.schema_migrations`
-- em 2026-09-16, com o SQL exatamente como foi executado.
--
-- Identidade no banco: version=20260909151459, name=orphan_property_images
--
-- NÃO reaplicar: já está no histórico da produção. Este arquivo existe para que
-- a pasta pare de mentir sobre o banco. Ver o README desta pasta.

create or replace function public.orphan_property_images(grace_hours int default 24)
returns table (name text)
language sql
security definer
set search_path = public, storage
as $$
  with referenced as (
    select split_part(split_part(url, '/object/public/property-images/', 2), '?', 1) as name
      from public.property_images
     where url like '%/object/public/property-images/%'
    union
    select split_part(split_part(url_sm, '/object/public/property-images/', 2), '?', 1)
      from public.property_images
     where url_sm like '%/object/public/property-images/%'
  )
  select o.name
    from storage.objects o
   where o.bucket_id = 'property-images'
     and o.created_at < now() - make_interval(hours => grace_hours)
     and not exists (select 1 from referenced r where r.name = o.name);
$$;

comment on function public.orphan_property_images(int) is
  'Arquivos de property-images sem linha em property_images, mais velhos que grace_hours. Usada pela edge function cleanup-orphan-images.';

revoke all on function public.orphan_property_images(int) from public;
revoke all on function public.orphan_property_images(int) from anon;
revoke all on function public.orphan_property_images(int) from authenticated;
grant execute on function public.orphan_property_images(int) to service_role;
