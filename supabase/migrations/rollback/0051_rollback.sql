-- Desfaz a 0051. Só é seguro enquanto nenhuma cobrança foi emitida por
-- provedor: as colunas derrubadas levam junto o id externo e a linha
-- digitável, e sem elas o webhook de um boleto já emitido não acha mais a
-- cobrança (o pagamento do inquilino seria ignorado em silêncio).
drop table if exists public.payment_webhook_events;
drop table if exists public.payment_customers;
drop table if exists public.tenant_payment_accounts;

drop index if exists public.contract_charges_externo_idx;
alter table public.contract_charges drop constraint if exists contract_charges_multa_juros;
alter table public.contract_charges drop constraint if exists contract_charges_ambiente_valido;
alter table public.contract_charges drop constraint if exists contract_charges_provider_valido;
alter table public.contract_charges
  drop column if exists interest_monthly_percent,
  drop column if exists fine_percent,
  drop column if exists issued_at,
  drop column if exists pix_copy_paste,
  drop column if exists digitable_line,
  drop column if exists bank_slip_url,
  drop column if exists payment_url,
  drop column if exists external_id,
  drop column if exists provider_environment,
  drop column if exists provider;
