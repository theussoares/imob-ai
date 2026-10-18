-- Cobrança pela Cora (Integração Direta, mTLS) ao lado do Asaas.
--
-- Por que existe: a primeira imobiliária de verdade (OLMI) abriu conta na
-- Cora, não no Asaas. A 0051 só sabia guardar UMA chave de API de texto
-- (`api_key_ciphertext`); a Cora autentica com `client_id` + certificado +
-- chave privada (mTLS), e nenhum desses cabe numa coluna de chave.
--
-- As decisões, cada uma com o que evita:
--   1. `client_id` fica legível (identifica a conta, não dá poder sozinho) e
--      certificado + chave privada vão cifrados juntos em
--      `credentials_ciphertext` (mesmo cofre da chave do Asaas). Dump do banco
--      sem a chave-mestra não emite boleto. Continua sem policy e sem grant:
--      só service_role lê (0051).
--   2. A Cora NÃO assina o webhook (chega sem corpo, só cabeçalhos). Quem
--      prova a autoria é o `webhook_id` secreto da URL + a reconsulta do
--      boleto na API. Por isso `webhook_secret_hash` deixa de ser exigido.
--   3. O painel precisa dizer "conectada, certificado válido até X" e avisar
--      antes de vencer. Certificado vencido derruba a emissão e só aparece
--      no primeiro boleto recusado; guardamos a validade lida do X.509.
--   4. `payment_webhook_events.processed_at`: a Cora reenvia sem corpo, então
--      "recebido" e "aplicado" precisam ser distinguíveis para investigar um
--      evento que chegou e não baixou.
--
-- ⚠️ Os CHECKs de `provider` são reescritos com TODOS os valores por extenso
-- (como na 0055): recriar sem um deles quebraria as contas e cobranças
-- existentes daquele provedor.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. tenant_payment_accounts
-- ---------------------------------------------------------------------------
alter table public.tenant_payment_accounts drop constraint if exists tenant_payment_accounts_provider_check;
alter table public.tenant_payment_accounts
  add constraint tenant_payment_accounts_provider_check check (provider in ('asaas', 'cora', 'simulado'));

alter table public.tenant_payment_accounts add column if not exists client_id text;
alter table public.tenant_payment_accounts add column if not exists credentials_ciphertext text;
alter table public.tenant_payment_accounts add column if not exists connection_status text not null default 'conectada';
alter table public.tenant_payment_accounts add column if not exists credentials_updated_at timestamptz;
alter table public.tenant_payment_accounts add column if not exists last_verified_at timestamptz;
alter table public.tenant_payment_accounts add column if not exists certificate_expires_at timestamptz;

alter table public.tenant_payment_accounts drop constraint if exists tenant_payment_accounts_status_valido;
alter table public.tenant_payment_accounts
  add constraint tenant_payment_accounts_status_valido check (connection_status in ('conectada', 'credencial_invalida'));

-- Substitui a `chave_coerente` da 0051: cada provedor exige o seu conjunto.
alter table public.tenant_payment_accounts drop constraint if exists tenant_payment_accounts_chave_coerente;
alter table public.tenant_payment_accounts drop constraint if exists tenant_payment_accounts_credencial_coerente;
alter table public.tenant_payment_accounts
  add constraint tenant_payment_accounts_credencial_coerente check (
    provider = 'simulado'
    or (provider = 'asaas' and api_key_ciphertext is not null and webhook_secret_hash is not null)
    or (provider = 'cora' and client_id is not null and credentials_ciphertext is not null)
  );

comment on column public.tenant_payment_accounts.credentials_ciphertext is
  'Cora: JSON {certificatePem, privateKeyPem} cifrado pela aplicação (AES-256-GCM). Só service_role. Ver 0058.';
comment on column public.tenant_payment_accounts.certificate_expires_at is
  'Validade do certificado mTLS, lida do X.509 no upload. Alimenta o aviso de vencimento no painel.';

-- ---------------------------------------------------------------------------
-- 2. payment_customers, payment_webhook_events, contract_charges
-- ---------------------------------------------------------------------------
alter table public.payment_customers drop constraint if exists payment_customers_provider_check;
alter table public.payment_customers
  add constraint payment_customers_provider_check check (provider in ('asaas', 'cora', 'simulado'));

alter table public.payment_webhook_events drop constraint if exists payment_webhook_events_provider_check;
alter table public.payment_webhook_events
  add constraint payment_webhook_events_provider_check check (provider in ('asaas', 'cora', 'simulado'));
alter table public.payment_webhook_events add column if not exists processed_at timestamptz;

alter table public.contract_charges drop constraint if exists contract_charges_provider_valido;
alter table public.contract_charges
  add constraint contract_charges_provider_valido check (provider is null or provider in ('asaas', 'cora', 'simulado'));
