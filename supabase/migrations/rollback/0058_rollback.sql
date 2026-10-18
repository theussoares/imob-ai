-- Rollback da 0058.
--
-- ⚠️ A ORDEM importa: as linhas da Cora saem ANTES de reapertar os CHECKs, ou
-- a constraint recusa a si mesma. Cobrança já emitida na Cora perde o vínculo:
-- cancele os boletos no painel da Cora antes de reverter.

delete from public.payment_webhook_events where provider = 'cora';
delete from public.payment_customers where provider = 'cora';
update public.contract_charges set provider = null, provider_environment = null, external_id = null
  where provider = 'cora';
delete from public.tenant_payment_accounts where provider = 'cora';

alter table public.tenant_payment_accounts drop constraint if exists tenant_payment_accounts_credencial_coerente;
alter table public.tenant_payment_accounts
  add constraint tenant_payment_accounts_chave_coerente check (
    provider = 'simulado' or (api_key_ciphertext is not null and webhook_secret_hash is not null)
  );
alter table public.tenant_payment_accounts drop constraint if exists tenant_payment_accounts_status_valido;
alter table public.tenant_payment_accounts drop column if exists client_id;
alter table public.tenant_payment_accounts drop column if exists credentials_ciphertext;
alter table public.tenant_payment_accounts drop column if exists connection_status;
alter table public.tenant_payment_accounts drop column if exists credentials_updated_at;
alter table public.tenant_payment_accounts drop column if exists last_verified_at;
alter table public.tenant_payment_accounts drop column if exists certificate_expires_at;

alter table public.tenant_payment_accounts drop constraint if exists tenant_payment_accounts_provider_check;
alter table public.tenant_payment_accounts
  add constraint tenant_payment_accounts_provider_check check (provider in ('asaas', 'simulado'));
alter table public.payment_customers drop constraint if exists payment_customers_provider_check;
alter table public.payment_customers
  add constraint payment_customers_provider_check check (provider in ('asaas', 'simulado'));
alter table public.payment_webhook_events drop constraint if exists payment_webhook_events_provider_check;
alter table public.payment_webhook_events
  add constraint payment_webhook_events_provider_check check (provider in ('asaas', 'simulado'));
alter table public.payment_webhook_events drop column if exists processed_at;
alter table public.contract_charges drop constraint if exists contract_charges_provider_valido;
alter table public.contract_charges
  add constraint contract_charges_provider_valido check (provider is null or provider in ('asaas', 'simulado'));
