-- A página "Quem somos" passa a ser recurso por imobiliária.
--
-- O sintoma que motivou: `/quem-somos` entrava em `STATIC_FOOTER_PAGES`, que é
-- visível por padrão, então o link nasceria no rodapé das QUATRO imobiliárias —
-- e no banco só uma tinha `about_content` preenchido. As outras três ganhariam,
-- no ar, um link para uma página em branco cujo `canonical` afirma ser a versão
-- autoritativa daquele domínio. Conteúdo fino indexável no site de cliente real
-- é pior que página nenhuma, e foi o que segurou a feature fora da produção nos
-- deploys de 18 e 19/09.
--
-- O desenho copia o da Área do Cliente, e são DUAS camadas independentes de
-- propósito:
--
--   * `tenant_features` com `feature = 'about'` — a imobiliária TEM o recurso.
--     Só nós ligamos; é a mesma tabela que `is_portal_user()` já lê para o
--     portal, e a mesma régua de carência (`enabled or grace_until >=
--     current_date`).
--   * `tenants.about_enabled` — a imobiliária LIGOU a página no site dela.
--     Escolha dela, no painel.
--
-- O payload público carrega só o produto dos dois (`comLinksEfetivos`, em
-- `server/utils/tenant.ts`). Separar importa pelo caminho da suspensão, que já
-- mordeu no portal: se a carência vence e a coluna continua `true`, o link
-- seguiria no ar apontando para uma página que o servidor recusa.
--
-- ⚠️ Não há RLS nova aqui, e isso é deliberado — ao contrário do portal, esta
-- página não guarda dado de ninguém. O que o recurso controla é PUBLICAÇÃO, não
-- acesso: quem fecha é o 404 em `app/pages/quem-somos.vue`. `about_content` já
-- viaja no payload público do tenant desde a 0029.
--
-- Idempotente: seguro rodar de novo.

-- 1. O interruptor da imobiliária. Nasce `false`: ninguém publica por acidente.
alter table public.tenants
  add column if not exists about_enabled boolean not null default false;

comment on column public.tenants.about_enabled is
  'Publica /quem-somos no site. Vale junto com tenant_features.feature = about — ver 0039.';

-- 2. A lista de recursos aceitos passa a ter dois valores.
--
-- A 0036 fechou o CHECK em `feature = 'portal'`, que era o único que existia.
-- Sem alargar aqui, o insert abaixo morre com violação de CHECK.
--
-- ⚠️ ALARGAR é compatível com a versão anterior e pode ir ANTES do deploy: o
-- código no ar só escreve `'portal'`, que continua aceito. Apertar seria o
-- contrário — foi a lição da 0017/0018, quando o CHECK de `leads.source` subiu
-- antes do código que gravava o valor novo e todo contato do site virou 500.
alter table public.tenant_features
  drop constraint if exists tenant_features_feature_check;

alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about'));

-- 3. O recurso, para quem já usa a página.
--
-- Só a `demo` recebe: é a única com blocos escritos. As outras três ficam SEM
-- linha, e ausência é desligado (`recursoAtivo` devolve false para null) — o
-- lado seguro para recurso cobrável, o mesmo critério da 0036.
insert into public.tenant_features (tenant_id, feature, enabled, enabled_at, notes)
select t.id, 'about', true, now(), 'Liberado na 0039: já usava a página antes do recurso existir.'
from public.tenants t
where t.slug = 'demo'
on conflict (tenant_id, feature) do nothing;

-- 4. E o interruptor dela ligado, para a página não sumir de quem já a tinha.
--
-- Condicionado ao conteúdo, não ao slug: um tenant sem bloco nenhum não deve
-- ser publicado por esta migration nem por engano.
update public.tenants t
set about_enabled = true
where t.slug = 'demo'
  and jsonb_array_length(coalesce(t.about_content -> 'blocks', '[]'::jsonb)) > 0;
