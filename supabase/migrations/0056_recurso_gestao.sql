-- Painel de Gestão (/gestao: contratos de venda e locação) passa a ser recurso
-- por imobiliária, em vez de um interruptor global da implantação.
--
-- O motivo: o gate do MVP era `NUXT_PUBLIC_GESTAO_ENABLED`, uma variável de
-- ambiente. Ligá-la abre /gestao para TODO tenant que a implantação serve, e a
-- Olmi é a única que valida essas telas. Com a linha `gestao` em
-- `tenant_features`, só quem tem a linha ligada enxerga o painel; o resto
-- continua recebendo 404.
--
-- ⚠️ Escrita por extenso, pelo mesmo motivo da 0045 e da 0055: recriar a
-- constraint sem um dos valores existentes DESLIGA aquele recurso de toda
-- imobiliária que paga.
--
-- Idempotente: seguro rodar de novo. A linha da Olmi NÃO é inserida aqui (o id
-- do tenant não é conhecido pela migration); ver o comando no PR.

alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai', 'crm', 'cobranca', 'gestao'));
