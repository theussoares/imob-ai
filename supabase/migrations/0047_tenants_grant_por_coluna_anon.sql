-- `tenants` passa a ter privacidade por coluna para o papel `anon`.
--
-- O sintoma, achado na auditoria de 25/09: com a anon key — que vai no HTML de
-- toda página — `GET /rest/v1/tenants?select=updated_by,ai_tone` devolvia as
-- duas colunas de toda imobiliária ativa. `updated_by` é o id do usuário do
-- painel que editou por último; `ai_tone` é configuração interna. Nenhuma é
-- catastrófica, mas nenhuma tem motivo para ser pública, e a tabela era a
-- única com dado público que ainda tinha SELECT na tabela inteira — `brokers`
-- e `properties` já são por coluna desde a 0005/0011.
--
-- ⚠️ ORDEM DE DEPLOY — o risco desta migration é derrubar TODOS os sites.
-- A resolução de tenant roda com a anon key. Enquanto o código em produção
-- fizer `select('*')` em `tenants`, o PostgREST expande o `*` para todas as
-- colunas, bate numa sem grant e devolve `permission denied` — e a resolução
-- de tenant é o que serve toda página de todo cliente. Então:
--
--   1. subir para produção o código que lê `TENANT_PUBLIC_COLUMNS`
--      (`server/mappers/tenant.mapper.ts`) — ele funciona com e sem esta
--      migration;
--   2. só depois aplicar esta migration.
--
-- Aplicar antes do deploy é o incidente. Não há atalho seguro.
--
-- A lista abaixo é a mesma de `TENANT_PUBLIC_COLUMNS`, e há um teste que
-- compara as duas (`test/server/tenant-colunas-publicas.test.ts`). Coluna
-- nova que o site público precise ler entra nos DOIS lugares, nesta ordem:
-- migration aplicada primeiro, código depois — o inverso do passo acima,
-- pelo mesmo motivo.
--
-- O que NÃO muda: `authenticated` e `service_role` seguem lendo a tabela
-- inteira (o painel e o cron precisam de `updated_by`/`ai_tone`), e a policy
-- `tenant_domains_public_read`, que consulta `tenants.id` e `tenants.active`
-- como anon, segue funcionando — as duas colunas estão no grant.
--
-- Idempotente: `revoke` e `grant` repetidos não erram. Privacidade por coluna
-- exige o `revoke select` da tabela ANTES do `grant select (...)`: o grant de
-- tabela cobre todas as colunas e tornaria o de coluna inócuo.

revoke select on public.tenants from anon;

grant select (
  id, slug, name, tagline, active,
  hero_title, hero_subtitle, hero_image, hero_image_position, hero_cta_label, hero_cta_href,
  whatsapp, phone, email, creci, instagram, website,
  portal_enabled, about_enabled,
  city, state, address_street, address_number, address_complement, address_neighborhood, address_zip,
  latitude, longitude,
  brand_primary, brand_accent, whatsapp_button_color, logo_url, favicon_url,
  alternate_names, footer_text, footer_links, footer_pages, about_content
) on public.tenants to anon;
