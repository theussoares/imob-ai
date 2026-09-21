-- Integridade do modelo financeiro: tira três índices únicos redundantes e faz
-- as três FKs de estorno carregarem `tenant_id`.
--
-- Por que migration nova e não emenda na 0041: a 0041 JÁ RODOU em produção.
-- Editar o arquivo aplicado deixaria o repositório descrevendo um schema que o
-- banco não tem, e a correção nunca seria executada em lugar nenhum — o
-- Supabase não reaplica migration já registrada.
--
-- Por que agora: as seis tabelas estão VAZIAS e não têm endpoint, tela nem
-- consumidor. Trocar uma FK com dado dentro obrigaria a decidir o que fazer com
-- cada linha órfã antes do `add constraint`; hoje é um `alter table` que não
-- pode falhar. É o momento mais barato que esta correção vai ter.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. Os índices únicos duplicados em (id, tenant_id)
--
-- `payout_destinations`, `contract_charges` e `owner_payouts` declaram
-- `unique (id, tenant_id)` inline na `create table` — o que já cria um índice
-- único, chamado `<tabela>_id_tenant_id_key`. A 0041 acrescentou por cima um
-- `create unique index ..._id_tenant_idx` nas MESMAS colunas. São dois índices
-- idênticos: toda escrita paga a manutenção dos dois, e nenhuma leitura ganha
-- nada com o segundo.
--
-- Antes de derrubar, foi consultado `pg_constraint.conindid` no banco para ver
-- qual índice cada FK composta de fato usa: todas as FKs que apontam para estas
-- três se penduraram no índice da constraint inline (`_id_tenant_id_key`), o
-- que deixa os `_idx` órfãos.
--
-- ⚠️ `contracts_id_tenant_idx` e `portal_users_id_tenant_idx` NÃO entram nesta
-- lista, por mais que o nome seja igual. Essas duas tabelas são pré-existentes
-- e não têm o `unique (id, tenant_id)` inline: o índice explícito criado pela
-- 0041 é a ÚNICA coisa que permite a FK composta apontar para elas. Derrubar
-- qualquer um dos dois quebra a 0041.
-- ---------------------------------------------------------------------------
drop index if exists public.payout_destinations_id_tenant_idx;
drop index if exists public.contract_charges_id_tenant_idx;
drop index if exists public.owner_payouts_id_tenant_idx;

-- ---------------------------------------------------------------------------
-- 2. As FKs de estorno passam a carregar `tenant_id`
--
-- `charge_items.reverses_item_id`, `charge_settlements.reverses_settlement_id`
-- e `payout_items.reverses_item_id` apontam hoje só para `(id)`. São a única
-- exceção ao padrão de FK composta em todo o modelo financeiro, e não por
-- decisão — passaram despercebidas por serem auto-referências.
--
-- O que a coluna única permite: uma linha de estorno do tenant A apontando para
-- o item do tenant B. Isso NÃO é vazamento — a RLS esconde a linha apontada na
-- leitura. É pior de achar do que vazamento: num livro-caixa append-only, o
-- estorno passa a dizer que reverte algo que, para quem o lê, não existe. O
-- `join` não levanta erro, a linha simplesmente some do extrato.
-- ---------------------------------------------------------------------------

-- 2.1 O unique que a FK composta exige do lado apontado.
--
-- Estas três não têm `unique (id, tenant_id)`: na 0041 elas são filhas, e
-- ninguém previu que seriam também pais de si mesmas. Sem este índice o
-- `add constraint` do passo 2.3 é recusado.
create unique index if not exists charge_items_id_tenant_idx
  on public.charge_items (id, tenant_id);
create unique index if not exists charge_settlements_id_tenant_idx
  on public.charge_settlements (id, tenant_id);
create unique index if not exists payout_items_id_tenant_idx
  on public.payout_items (id, tenant_id);

-- 2.2 Sai a FK de coluna única.
--
-- Os nomes não foram escolhidos: são os que o Postgres gerou sozinho na 0041,
-- no formato `<tabela>_<coluna>_fkey`, por a FK ter sido declarada no nível da
-- coluna. Conferidos no banco antes de escrever isto.
alter table public.charge_items
  drop constraint if exists charge_items_reverses_item_id_fkey;
alter table public.charge_settlements
  drop constraint if exists charge_settlements_reverses_settlement_id_fkey;
alter table public.payout_items
  drop constraint if exists payout_items_reverses_item_id_fkey;

-- 2.3 Entra a composta.
--
-- O `drop constraint if exists` colado no `add constraint` é o que torna este
-- bloco idempotente: `add constraint` não aceita `if not exists`, e sem o drop
-- a segunda execução aborta a migration inteira no meio.
--
-- Sem `on delete`: o padrão (NO ACTION) é o certo num livro-caixa append-only.
-- Cascata apagaria a linha estornada junto com o estorno, destruindo justamente
-- a prova do que foi corrigido; `set null` deixaria o estorno sem referente.
-- Aqui o correto é o banco RECUSAR o delete.
alter table public.charge_items
  drop constraint if exists charge_items_reverses_item_tenant_fkey;
alter table public.charge_items
  add constraint charge_items_reverses_item_tenant_fkey
  foreign key (reverses_item_id, tenant_id) references public.charge_items (id, tenant_id);

alter table public.charge_settlements
  drop constraint if exists charge_settlements_reverses_settlement_tenant_fkey;
alter table public.charge_settlements
  add constraint charge_settlements_reverses_settlement_tenant_fkey
  foreign key (reverses_settlement_id, tenant_id) references public.charge_settlements (id, tenant_id);

alter table public.payout_items
  drop constraint if exists payout_items_reverses_item_tenant_fkey;
alter table public.payout_items
  add constraint payout_items_reverses_item_tenant_fkey
  foreign key (reverses_item_id, tenant_id) references public.payout_items (id, tenant_id);
