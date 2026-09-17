-- ⚠️ IMPORTADA DA PRODUÇÃO — não foi escrita aqui.
--
-- Aplicada direto no banco em 2026-09-08, sem nunca
-- ter sido commitada. Recuperada de `supabase_migrations.schema_migrations`
-- em 2026-09-16, com o SQL exatamente como foi executado.
--
-- Identidade no banco: version=20260908205707, name=0030_broker_public_profile
--
-- NÃO reaplicar: já está no histórico da produção. Este arquivo existe para que
-- a pasta pare de mentir sobre o banco. Ver o README desta pasta.

alter table public.brokers
  add column if not exists photo_url text,
  add column if not exists bio text,
  add column if not exists public_visible boolean not null default false;

grant select (id, name, photo_url, bio, creci) on public.brokers to anon, authenticated;

create policy "brokers_public_read" on public.brokers
  for select using (active = true and public_visible = true);
