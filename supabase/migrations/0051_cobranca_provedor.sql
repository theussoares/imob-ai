-- Cobrança por provedor (boleto + Pix): a conta de pagamento da imobiliária,
-- o cliente no provedor, o que a cobrança emitida precisa lembrar e o diário
-- dos webhooks.
--
-- Por que existe: as seis tabelas da 0041/0042 sabem REGISTRAR dinheiro, mas
-- não sabem EMITIR. Faltava onde guardar a chave do Asaas da imobiliária, o id
-- do inquilino lá dentro, e o boleto que saiu (linha digitável, Pix, link).
-- Spec 25/09, seção 4 (Frente B).
--
-- As decisões caras, cada uma com o incidente que evita:
--   1. A chave de API NÃO fica legível no banco: a aplicação grava o texto
--      cifrado (AES-256-GCM, chave fora do banco). Um dump ou um select
--      esquecido não pode virar o poder de emitir e estornar cobrança no CNPJ
--      do cliente.
--   2. `tenant_payment_accounts` é SÓ service_role: nem o membro lê. O painel
--      vê o que o endpoint recorta (provedor, ambiente, 4 últimos dígitos).
--   3. O webhook acha a imobiliária pelo `webhook_id` da URL e confere o
--      segredo do cabeçalho contra um HASH. O `tenant_id` nunca sai do corpo
--      (invariante nº 1).
--   4. `payment_webhook_events` é o diário e a trava de idempotência de TODO
--      evento, não só dos que viram liquidação: cancelamento e estorno chegam
--      repetidos também.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. tenant_payment_accounts — a conta de cobrança de cada imobiliária
--
-- Uma por tenant (PK = tenant_id): trocar de provedor ou de ambiente é
-- sobrescrever, não acumular. Duas contas ativas pediriam uma regra de "qual
-- emite", e ninguém pediu isso.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_payment_accounts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- `simulado` é o plano B da demonstração e dos testes: mesma tela, mesmo
  -- fluxo, sem rede. Nunca emite boleto de verdade.
  provider text not null check (provider in ('asaas', 'simulado')),
  environment text not null check (environment in ('sandbox', 'producao')),
  -- `v1:<iv>:<tag>:<cifrado>` em base64. Nulo só no simulado, que não tem chave.
  api_key_ciphertext text,
  api_key_last4 text,
  -- Nome da conta como o provedor devolveu — é o que a imobiliária reconhece
  -- ("é a conta certa?"), melhor que um id.
  account_name text,
  -- Identificador PÚBLICO que vai na URL do webhook. Não é o segredo: URL
  -- aparece em log de proxy e no painel do provedor.
  webhook_id uuid not null default gen_random_uuid() unique,
  -- sha256 (hex) do segredo que o provedor manda no cabeçalho. O segredo em si
  -- só existe no provedor e, por um instante, na memória de quem conectou.
  webhook_secret_hash text,
  -- Id do webhook no provedor, para desregistrar ao desconectar.
  external_webhook_id text,
  connected_at timestamptz not null default now(),
  connected_by uuid,
  updated_at timestamptz not null default now(),

  constraint tenant_payment_accounts_chave_coerente check (
    provider = 'simulado' or (api_key_ciphertext is not null and webhook_secret_hash is not null)
  )
);

alter table public.tenant_payment_accounts enable row level security;
-- Sem policy nenhuma e sem grant: o membro não lê nem o texto cifrado. Um
-- texto cifrado exposto ainda é alvo de força bruta offline se a chave-mestra
-- vazar um dia; não há motivo para ele sair do servidor.
revoke all on public.tenant_payment_accounts from anon;
revoke all on public.tenant_payment_accounts from authenticated;

comment on table public.tenant_payment_accounts is
  'Conta de cobrança da imobiliária (Asaas). Chave CIFRADA pela aplicação; só service_role. Ver 0051.';

-- ---------------------------------------------------------------------------
-- 2. payment_customers — a pessoa ↔ o id dela no provedor
--
-- Por ambiente: o cliente criado no sandbox não existe em produção, e reusar o
-- id faria a primeira cobrança real falhar com "customer not found".
-- ---------------------------------------------------------------------------
create table if not exists public.payment_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  portal_user_id uuid not null,
  provider text not null check (provider in ('asaas', 'simulado')),
  environment text not null check (environment in ('sandbox', 'producao')),
  external_id text not null,
  created_at timestamptz not null default now(),

  foreign key (portal_user_id, tenant_id) references public.portal_users (id, tenant_id) on delete cascade,
  unique (tenant_id, portal_user_id, provider, environment)
);

alter table public.payment_customers enable row level security;
revoke all on public.payment_customers from anon;
revoke insert, update, delete, truncate on public.payment_customers from authenticated;

drop policy if exists "cobranca_clientes_provedor_membro" on public.payment_customers;
create policy "cobranca_clientes_provedor_membro" on public.payment_customers
  for select to authenticated
  using (is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 3. contract_charges — o que a cobrança emitida precisa lembrar
--
-- Multa e juros são COPIADOS do contrato na emissão, como o `issued_amount`: o
-- boleto impresso diz 2% e 1% a.m., e mudar o contrato depois não pode fazer o
-- painel mostrar outra regra para um boleto que já está na mão do inquilino.
-- ---------------------------------------------------------------------------
alter table public.contract_charges add column if not exists provider text;
alter table public.contract_charges add column if not exists provider_environment text;
alter table public.contract_charges add column if not exists external_id text;
alter table public.contract_charges add column if not exists payment_url text;
alter table public.contract_charges add column if not exists bank_slip_url text;
alter table public.contract_charges add column if not exists digitable_line text;
alter table public.contract_charges add column if not exists pix_copy_paste text;
-- Preenchido ANTES de chamar o provedor, como trava: dois cliques em "Emitir"
-- não podem gerar dois boletos. `issued_at` com `issued_amount` nulo é
-- "emitindo"; se o provedor falha, a trava é desfeita.
alter table public.contract_charges add column if not exists issued_at timestamptz;
alter table public.contract_charges add column if not exists fine_percent numeric(5,2);
alter table public.contract_charges add column if not exists interest_monthly_percent numeric(5,2);

alter table public.contract_charges drop constraint if exists contract_charges_provider_valido;
alter table public.contract_charges add constraint contract_charges_provider_valido
  check (provider is null or provider in ('asaas', 'simulado'));
alter table public.contract_charges drop constraint if exists contract_charges_ambiente_valido;
alter table public.contract_charges add constraint contract_charges_ambiente_valido
  check (provider_environment is null or provider_environment in ('sandbox', 'producao'));
-- Os mesmos tetos da 0050 (Lei do Inquilinato na prática dos tribunais).
alter table public.contract_charges drop constraint if exists contract_charges_multa_juros;
alter table public.contract_charges add constraint contract_charges_multa_juros check (
  (fine_percent is null or fine_percent between 0 and 10)
  and (interest_monthly_percent is null or interest_monthly_percent between 0 and 1)
);

-- É por aqui que o webhook acha a cobrança. Único por tenant+provedor: um
-- mesmo id externo apontando para duas cobranças faria um pagamento baixar as
-- duas.
create unique index if not exists contract_charges_externo_idx
  on public.contract_charges (tenant_id, provider, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- 4. payment_webhook_events — diário e trava de idempotência
--
-- O provedor reenvia (e o Asaas PAUSA a fila da conta depois de falhas
-- seguidas, então responder erro para "já vi isso" é pior que inútil). O
-- único (tenant, provedor, evento) é o que faz o reenvio virar no-op.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('asaas', 'simulado')),
  event_id text not null,
  event_type text not null,
  external_id text,
  -- O que a aplicação fez com ele: `liquidada`, `cancelada`, `ignorado`,
  -- `sem_cobranca`… Texto livre de propósito: é diário, não regra.
  outcome text,
  received_at timestamptz not null default now(),
  unique (tenant_id, provider, event_id)
);

create index if not exists payment_webhook_events_externo_idx
  on public.payment_webhook_events (tenant_id, external_id);

alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from anon;
revoke insert, update, delete, truncate on public.payment_webhook_events from authenticated;

drop policy if exists "cobranca_webhooks_membro" on public.payment_webhook_events;
create policy "cobranca_webhooks_membro" on public.payment_webhook_events
  for select to authenticated
  using (is_tenant_member(tenant_id));
