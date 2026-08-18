-- Classificação do lead: o QUE a pessoa quer (lead_type) e POR ONDE ela entrou
-- (source, que hoje é texto livre).
--
-- Motivo: até agora só existia um formulário público — o da página de imóvel —
-- então todo lead era implicitamente "alguém interessado neste imóvel". Com as
-- novas capturas (proprietário que quer vender, busca sem resultado, fim do
-- catálogo) os contatos passam a chegar com intenções opostas, e sem esta coluna
-- todos cairiam na coluna "Novo" do funil com exatamente a mesma cara.

alter table public.leads
  add column if not exists lead_type text not null default 'indefinido';

-- ---------------------------------------------------------------------------
-- Backfill do lead_type
-- ---------------------------------------------------------------------------
-- Lead ligado a um imóvel veio do formulário daquele imóvel: a pessoa PROCURA
-- algo assim. Se procura para comprar ou para alugar não é chute — está no
-- `purpose` do imóvel.
update public.leads l
set lead_type = case p.purpose
                  when 'aluguel' then 'busca_aluguel'
                  else 'busca_compra'
                end
from public.properties p
where l.property_id = p.id
  and l.lead_type = 'indefinido';

-- Lead sem imóvel (cadastro manual) fica 'indefinido' mesmo: inventar aqui seria
-- pior que admitir que não sabemos — o corretor reclassifica no painel.

-- ---------------------------------------------------------------------------
-- Backfill da origem
-- ---------------------------------------------------------------------------
-- 'form' era o único valor do formulário público, e ele só existia na página de
-- imóvel. Renomear em vez de manter os dois nomes: dois rótulos para a mesma
-- coisa envenenariam a métrica de aquisição para sempre.
update public.leads set source = 'property_page' where source = 'form';

-- Qualquer valor fora da lista (o endpoint público aceitava texto livre no body)
-- vira 'outro' — senão o CHECK abaixo não consegue ser criado.
update public.leads
set source = 'outro'
where source not in (
  'property_page', 'catalog_empty', 'catalog_footer', 'quero_vender', 'manual', 'outro'
);

-- ---------------------------------------------------------------------------
-- Lista fechada do tipo (segura agora: nenhum código em produção grava
-- `lead_type`, então todas as linhas ficam no default `indefinido`)
-- ---------------------------------------------------------------------------
alter table public.leads
  drop constraint if exists leads_lead_type_check;
alter table public.leads
  add constraint leads_lead_type_check
  check (lead_type in ('busca_compra', 'busca_aluguel', 'oferta_venda', 'oferta_aluguel', 'indefinido'));

-- A lista fechada de `source` NÃO entra aqui de propósito — ela vive na 0018.
-- Constraint que aperta valores só pode ser aplicada DEPOIS que o código que os
-- satisfaz está no ar: enquanto a versão antiga estiver rodando ela grava
-- `source = 'form'`, e um CHECK sem esse valor derruba o formulário público em
-- produção. Adicionar coluna é seguro antes do deploy; restringir valor não é.

