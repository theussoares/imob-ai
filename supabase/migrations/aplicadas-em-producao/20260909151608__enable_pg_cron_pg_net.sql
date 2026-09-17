-- ⚠️ IMPORTADA DA PRODUÇÃO — não foi escrita aqui.
--
-- Aplicada direto no banco em 2026-09-09, sem nunca
-- ter sido commitada. Recuperada de `supabase_migrations.schema_migrations`
-- em 2026-09-16, com o SQL exatamente como foi executado.
--
-- Identidade no banco: version=20260909151608, name=enable_pg_cron_pg_net
--
-- NÃO reaplicar: já está no histórico da produção. Este arquivo existe para que
-- a pasta pare de mentir sobre o banco. Ver o README desta pasta.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
