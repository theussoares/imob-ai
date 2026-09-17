-- ⚠️ IMPORTADA DA PRODUÇÃO — não foi escrita aqui.
--
-- Aplicada direto no banco em 2026-09-08, sem nunca
-- ter sido commitada. Recuperada de `supabase_migrations.schema_migrations`
-- em 2026-09-16, com o SQL exatamente como foi executado.
--
-- Identidade no banco: version=20260908200227, name=0029_tenant_about_page
--
-- NÃO reaplicar: já está no histórico da produção. Este arquivo existe para que
-- a pasta pare de mentir sobre o banco. Ver o README desta pasta.

alter table public.tenants
  add column if not exists about_content jsonb not null default '{"blocks": []}'::jsonb;

grant select (about_content) on public.tenants to anon, authenticated;
