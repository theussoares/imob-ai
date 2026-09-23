-- Rollback da 0042.
--
-- ⚠️ A ORDEM é a inversa da migration, e por um motivo mecânico: o índice único
-- em (id, tenant_id) é o que sustenta a FK composta. Derrubar o índice antes de
-- derrubar a FK faz o Postgres recusar o `drop index`.
--
-- ⚠️ O que se perde ao reverter:
--   1. volta a ser possível gravar estorno do tenant A apontando para item do
--      tenant B — sem erro, sem rastro, e só visível quando alguém ler o
--      extrato e o item estornado não estiver lá;
--   2. voltam os três índices únicos redundantes em (id, tenant_id). Isso é
--      custo de escrita, não risco.
--
-- ⚠️ Se depois de reverter alguém gravar um estorno cruzando tenant, REAPLICAR
-- a 0042 vai falhar no `add constraint` — e falhar é o comportamento certo,
-- porque a linha cruzada precisa de decisão humana. Confira antes:
--
--   select count(*) from public.charge_items f
--     join public.charge_items p on p.id = f.reverses_item_id
--    where f.tenant_id <> p.tenant_id;

-- 1. Fora as FKs compostas.
alter table public.charge_items
  drop constraint if exists charge_items_reverses_item_tenant_fkey;
alter table public.charge_settlements
  drop constraint if exists charge_settlements_reverses_settlement_tenant_fkey;
alter table public.payout_items
  drop constraint if exists payout_items_reverses_item_tenant_fkey;

-- 2. De volta as FKs de coluna única, com o nome que o Postgres tinha gerado na
--    0041 — reaplicar a 0042 depois disto depende desses nomes exatos.
alter table public.charge_items
  drop constraint if exists charge_items_reverses_item_id_fkey;
alter table public.charge_items
  add constraint charge_items_reverses_item_id_fkey
  foreign key (reverses_item_id) references public.charge_items (id);

alter table public.charge_settlements
  drop constraint if exists charge_settlements_reverses_settlement_id_fkey;
alter table public.charge_settlements
  add constraint charge_settlements_reverses_settlement_id_fkey
  foreign key (reverses_settlement_id) references public.charge_settlements (id);

alter table public.payout_items
  drop constraint if exists payout_items_reverses_item_id_fkey;
alter table public.payout_items
  add constraint payout_items_reverses_item_id_fkey
  foreign key (reverses_item_id) references public.payout_items (id);

-- 3. Agora sim os índices que existiam só para sustentar as compostas.
drop index if exists public.charge_items_id_tenant_idx;
drop index if exists public.charge_settlements_id_tenant_idx;
drop index if exists public.payout_items_id_tenant_idx;

-- 4. E de volta os duplicados que a 0042 derrubou, para o banco ficar idêntico
--    ao estado pós-0041.
create unique index if not exists payout_destinations_id_tenant_idx
  on public.payout_destinations (id, tenant_id);
create unique index if not exists contract_charges_id_tenant_idx
  on public.contract_charges (id, tenant_id);
create unique index if not exists owner_payouts_id_tenant_idx
  on public.owner_payouts (id, tenant_id);
