-- Tema da vitrine e estilo do cabeçalho, por imobiliária.
--
-- Com cores diferentes, os sites dos clientes ainda pareciam o mesmo site:
-- fonte, raio, card e cabeçalho eram iguais para todos. Estas duas colunas
-- escolhem um de quatro temas curados e um de três cabeçalhos — ver
-- docs/superpowers/specs/2026-09-25-temas-da-vitrine-design.md.
--
-- Default = o site de hoje (`classico`, `claro`): aplicar esta migration não
-- muda a aparência de nenhum cliente.
--
-- ⚠️ ORDEM DE DEPLOY — o inverso da 0047, pelo mesmo motivo:
--
--   1. aplicar ESTA migration;
--   2. só depois subir o código que lê `site_theme` e `header_style`
--      (`TENANT_PUBLIC_COLUMNS`).
--
-- Código antes da migration faz a resolução de tenant (anon key) pedir colunas
-- que não existem ou sem grant — erro em toda página de todo cliente. A
-- migration antes do código é inofensiva: o código atual não lê as colunas.
--
-- ⚠️ Depende da 0047 JÁ aplicada. O `revoke select on public.tenants from anon`
-- da 0047 revoga também os grants por coluna (é o que o Postgres faz ao
-- revogar no nível da tabela), então uma 0047 aplicada DEPOIS apagaria o grant
-- abaixo e as duas colunas sumiriam para o anon — site fora do ar. Em
-- produção a 0047 está aplicada (conferido em 25/09: o anon recebe 42501 em
-- `updated_by` e lê `slug`). Num banco onde ela esteja pendente, aplique a
-- 0047 antes; se ela rodar depois por qualquer motivo, reaplique esta.
--
-- Por que `text` com `check`, e não enum do Postgres: o resto de `tenants`
-- (`hero_image_position`, `ai_tone`) já segue este padrão, e acrescentar um
-- tema vira trocar a constraint — sem o `alter type ... add value` que não roda
-- em transação. A lista é a mesma de `shared/models/site-theme.ts`, que é a
-- fonte única; o código ainda normaliza na leitura (`temaValido`), porque a
-- constraint não impede tudo (escrita com constraint desligada, restore).
--
-- Grant de SELECT para `anon`: desde a 0047 o anon só lê as colunas listadas,
-- e a resolução de tenant roda com a anon key. As duas são públicas por
-- natureza — é o próprio site que as usa para se desenhar.
--
-- Idempotente: `add column if not exists`, `drop constraint if exists` antes
-- de cada `add constraint`, `grant` repetido não erra.

alter table public.tenants
  add column if not exists site_theme text not null default 'classico',
  add column if not exists header_style text not null default 'claro';

-- Drop + add, como as constraints de `hero_image_position` (0009) e `ai_tone`
-- (0045): acrescentar um tema depois é repetir este par com a lista nova.
alter table public.tenants drop constraint if exists tenants_site_theme_check;
alter table public.tenants
  add constraint tenants_site_theme_check
  check (site_theme in ('classico', 'moderno', 'alto_padrao', 'acolhedor'));

alter table public.tenants drop constraint if exists tenants_header_style_check;
alter table public.tenants
  add constraint tenants_header_style_check
  check (header_style in ('claro', 'marca', 'escuro'));

grant select (site_theme, header_style) on public.tenants to anon;
