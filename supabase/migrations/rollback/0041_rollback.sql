-- Rollback da 0041.
--
-- ⚠️ A ORDEM importa: as filhas saem antes dos pais, senão a FK recusa.
--
-- Seguro enquanto as tabelas estiverem vazias, que é o estado em que nascem. Se
-- já houver cobrança ou repasse gravado, isto APAGA registro financeiro — e não
-- há de onde recuperar. Confira antes:
--
--   select count(*) from public.contract_charges;
--   select count(*) from public.owner_payouts;
--
-- Os índices em `portal_users` e `contracts` ficam: são redundantes com a PK,
-- não custam correção e removê-los quebraria qualquer FK composta que tenha
-- sido criada depois.

drop table if exists public.payout_items;
drop table if exists public.charge_settlements;
drop table if exists public.charge_items;
drop table if exists public.owner_payouts;
drop table if exists public.contract_charges;
drop table if exists public.payout_destinations;
