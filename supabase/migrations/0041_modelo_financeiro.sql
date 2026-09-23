-- Modelo de dados financeiro: seis tabelas VAZIAS, sem nenhuma lógica.
--
-- Hoje não existe nenhuma tabela financeira no banco. Há valores guardados
-- (`contracts.rent_amount`, `contract_internal.admin_fee_percent`,
-- `portal_documents.amount`), mas nenhum registro de que alguém DEVE algo a
-- alguém — o `amount` de um documento é metadado de um PDF.
--
-- Esta migration não constrói cobrança nem repasse. Ela cria o lugar onde vão
-- morar, enquanto migrar custa zero. O critério é um só: quando o primeiro
-- boleto existir, não haverá migração de dado a fazer.
--
-- O modelo acomoda, sem reestruturação, os três jeitos de operar o dinheiro:
--   1. a imobiliária recebe e repassa por fora (o sistema REGISTRA);
--   2. o sistema emite a cobrança e concilia (o sistema SABE);
--   3. split via conta digital (o sistema COMANDA).
-- A peça que compra isso é `charge_settlements`: a mesma forma serve para a
-- linha gravada à mão no painel e para a que chega por webhook.
--
-- Ver docs/superpowers/specs/2026-09-21-modelo-financeiro-design.md.
--
-- ⚠️ Listas fechadas são `text` com CHECK, não enum nativo. A spec registra que
-- os valores de `kind` ainda precisam de validação com quem opera uma carteira
-- de locação — e corrigir um CHECK é drop+create, enquanto valor de enum NÃO SE
-- REMOVE.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 0. O unique que as FKs compostas exigem, nos pais que já existem.
--
-- Redundante com a PK, de propósito: é o que permite a filha referenciar
-- (id, tenant_id) em vez de só id. Sem isso, uma linha filha poderia ter
-- tenant_id de A apontando para um pai de B, e a invariante nº 1 do repositório
-- cairia dentro da própria tabela escrita para respeitá-la.
-- ---------------------------------------------------------------------------
create unique index if not exists portal_users_id_tenant_idx
  on public.portal_users (id, tenant_id);
create unique index if not exists contracts_id_tenant_idx
  on public.contracts (id, tenant_id);

-- ---------------------------------------------------------------------------
-- 1. payout_destinations — para onde o dinheiro do proprietário vai
--
-- Tabela própria, e não colunas em `portal_users`, por três razões: a mesma
-- pessoa pode ter destinos diferentes por contrato; destinos mudam com o tempo;
-- e um repasse passado precisa continuar apontando para o destino que ele de
-- fato usou. Coluna sobrescrita apagaria isso.
-- ---------------------------------------------------------------------------
create table if not exists public.payout_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  portal_user_id uuid not null,
  kind text not null check (kind in ('pix', 'conta_bancaria')),

  -- Os quatro tipos do Banco Central. Guardar só a string perde a informação de
  -- QUAL é, que o provedor exige na hora de cobrar.
  pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  pix_key text,

  -- Dois identificadores de banco, e não um: o ISPB (8 dígitos) existe
  -- justamente para as instituições que NÃO possuem COMPE (3 dígitos) — caso de
  -- parte das fintechs. Com um campo só, um proprietário com conta numa dessas
  -- não teria como ser cadastrado, e o erro só apareceria no primeiro repasse.
  bank_code text,
  bank_ispb text,
  branch text,
  account text,
  account_digit text,
  -- `pagamento` está aqui porque conta de pagamento é tipo distinto no arranjo
  -- brasileiro, e é onde boa parte das pessoas recebe hoje.
  account_type text check (account_type in ('corrente', 'poupanca', 'pagamento')),

  -- A conta frequentemente NÃO é do proprietário: é do cônjuge, do espólio, de
  -- quem tem procuração. Assumir titular = proprietário quebra no primeiro
  -- inventário.
  holder_name text not null,
  holder_doc text not null,

  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,

  foreign key (portal_user_id, tenant_id) references public.portal_users (id, tenant_id) on delete cascade,
  unique (id, tenant_id),

  constraint payout_destinations_coerente check (
    (kind = 'pix' and pix_key_type is not null and pix_key is not null)
    or (
      kind = 'conta_bancaria'
      and branch is not null and account is not null
      and (bank_code is not null or bank_ispb is not null)
    )
  )
);

create unique index if not exists payout_destinations_id_tenant_idx
  on public.payout_destinations (id, tenant_id);
create index if not exists payout_destinations_tenant_idx
  on public.payout_destinations (tenant_id, portal_user_id);

-- ---------------------------------------------------------------------------
-- 2. contract_charges — o que o inquilino deve
-- ---------------------------------------------------------------------------
create table if not exists public.contract_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  kind text not null default 'mensal' check (kind in ('mensal', 'avulsa')),

  -- ⚠️ `competence` é o 1º dia do mês de OCUPAÇÃO, não do vencimento.
  --
  -- A Lei do Inquilinato estabelece aluguel VENCIDO como regra: o de janeiro se
  -- paga até o sexto dia útil de fevereiro. Antecipado é exceção restrita
  -- (temporada até 90 dias, ou contrato sem garantia — art. 42). Então as duas
  -- datas caem em meses diferentes, e é por isso que são colunas separadas em
  -- vez de uma só com deslocamento calculado.
  --
  -- Quem confundir as duas NÃO quebra a aplicação: quebra o DIMOB e o informe
  -- de rendimentos, sem erro em tempo de execução, e o sintoma aparece na malha
  -- fina de outra pessoa.
  competence date not null,
  due_on date not null,

  -- Dois valores, respondendo perguntas diferentes.
  --
  -- `issued_amount` é o que foi EMITIDO — o número impresso no boleto. Congelado:
  -- gravado na emissão, nunca alterado. É o retrato documental, e o que se
  -- compara contra o extrato bancário.
  --
  -- O total CORRENTE é a soma dos itens, derivado — o que se deve hoje, depois
  -- de descontos e estornos. Com append-only essa soma MUDA a cada correção, e
  -- por isso ela nunca poderia servir de retrato do que foi cobrado.
  issued_amount numeric(12,2),

  canceled_at timestamptz,
  canceled_by uuid,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,

  foreign key (contract_id, tenant_id) references public.contracts (id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);

create unique index if not exists contract_charges_id_tenant_idx
  on public.contract_charges (id, tenant_id);
create index if not exists contract_charges_tenant_idx
  on public.contract_charges (tenant_id, contract_id, competence);

-- Impede cobrar o mesmo mês duas vezes, sem bloquear cobrança avulsa nem
-- recriar depois de cancelar.
create unique index if not exists contract_charges_mensal_unica_idx
  on public.contract_charges (contract_id, competence)
  where kind = 'mensal' and canceled_at is null;

-- ---------------------------------------------------------------------------
-- 3. charge_items — a discriminação do lado do inquilino
--
-- Conferidos contra o que compõe um boleto de aluguel na prática: aluguel,
-- condomínio, IPTU (tipicamente rateado em 12 parcelas), seguro incêndio, multa
-- e juros por atraso, e acordos negociados — estes em `outros`, com a razão na
-- `description`. O IPTU parcelado não pede estrutura nova: cada mês é um item da
-- cobrança daquele mês.
-- ---------------------------------------------------------------------------
create table if not exists public.charge_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  charge_id uuid not null,
  kind text not null check (kind in (
    'aluguel', 'condominio', 'iptu', 'seguro', 'multa', 'juros', 'desconto', 'outros'
  )),
  description text,
  -- ASSINADO: positivo aumenta o que o inquilino deve, negativo reduz. Desconto
  -- e estorno usam o mesmo mecanismo, não campos separados.
  amount numeric(12,2) not null,
  reverses_item_id uuid references public.charge_items(id),
  created_at timestamptz not null default now(),
  created_by uuid,

  -- Append-only: a linha nunca muda. Correção é linha nova apontando para
  -- a que estorna.
  foreign key (charge_id, tenant_id) references public.contract_charges (id, tenant_id) on delete cascade
);

create index if not exists charge_items_tenant_idx
  on public.charge_items (tenant_id, charge_id);

-- ---------------------------------------------------------------------------
-- 4. charge_settlements — a liquidação, e a peça que compra os três modelos
-- ---------------------------------------------------------------------------
create table if not exists public.charge_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  charge_id uuid not null,
  -- ASSINADO, para estorno e chargeback terem onde ir.
  amount numeric(12,2) not null,

  -- ⚠️ Data FISCAL, não conveniência de modelagem. Para fins de imposto de
  -- renda, a data de recebimento do proprietário é a do pagamento do LOCATÁRIO,
  -- independentemente de quando o repasse saiu. Colapsar isto em
  -- `owner_payouts.paid_at` deixaria o modelo fiscalmente errado.
  settled_on date not null,

  method text not null check (method in ('boleto', 'pix', 'transferencia', 'dinheiro', 'outro')),
  -- Nosso número do boleto, id end-to-end do Pix, id da transação do provedor.
  external_ref text,
  -- Determinística, no formato `provedor:id_do_evento`. O índice único é o que
  -- impede um webhook reenviado de duplicar pagamento. Global e não por tenant:
  -- a chave já é namespaced pelo provedor, e colisão entre tenants seria defeito
  -- que se quer detectar, não tolerar.
  idempotency_key text unique,
  reverses_settlement_id uuid references public.charge_settlements(id),
  created_at timestamptz not null default now(),
  -- Nulo quando vem de webhook: liquidação automática não tem usuário.
  created_by uuid,

  foreign key (charge_id, tenant_id) references public.contract_charges (id, tenant_id) on delete cascade
);

create index if not exists charge_settlements_tenant_idx
  on public.charge_settlements (tenant_id, charge_id);
create index if not exists charge_settlements_data_idx
  on public.charge_settlements (tenant_id, settled_on);

-- ---------------------------------------------------------------------------
-- 5. owner_payouts — o repasse ao proprietário
--
-- `paid_at` fica no cabeçalho, sem tabela de liquidação espelhada, por uma
-- assimetria real do negócio: o inquilino paga em parcelas, a imobiliária
-- transfere UMA vez. Se repasse parcial aparecer, vira tabela — e aí é
-- `create table`, não migração de dado.
-- ---------------------------------------------------------------------------
create table if not exists public.owner_payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  competence date not null,

  -- Gravado NO repasse, não lido do cadastro na hora de exibir: é o que faz um
  -- extrato de seis meses atrás continuar dizendo para onde o dinheiro foi.
  destination_id uuid,

  scheduled_for date,
  paid_at timestamptz,
  external_ref text,
  idempotency_key text unique,
  canceled_at timestamptz,
  canceled_by uuid,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,

  foreign key (contract_id, tenant_id) references public.contracts (id, tenant_id) on delete cascade,
  foreign key (destination_id, tenant_id) references public.payout_destinations (id, tenant_id) on delete restrict,
  unique (id, tenant_id)
);

create unique index if not exists owner_payouts_id_tenant_idx
  on public.owner_payouts (id, tenant_id);
create index if not exists owner_payouts_tenant_idx
  on public.owner_payouts (tenant_id, contract_id, competence);

-- ---------------------------------------------------------------------------
-- 6. payout_items — o extrato discriminado
--
-- ⚠️ `retencao` é genérico de propósito. Uma versão anterior da spec tinha
-- `ir_retido`, assumindo que a imobiliária retém imposto de renda. ELA NÃO
-- RETÉM: não é fonte pagadora, recebe o aluguel como mandatária do proprietário.
-- Quem retém é a pessoa jurídica LOCATÁRIA, quando o inquilino é PJ e o
-- proprietário é PF; com inquilino pessoa física não há retenção alguma. Nesse
-- caso o IRRF já veio descontado do que o inquilino pagou — aparece como
-- `bruto` menor, não como retenção nossa.
--
-- A taxa de administração é dedutível do bruto antes do cálculo do imposto do
-- proprietário. Por isso ela precisa aparecer discriminada: é insumo da
-- declaração dele, não só transparência.
-- ---------------------------------------------------------------------------
create table if not exists public.payout_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payout_id uuid not null,
  kind text not null check (kind in (
    'bruto', 'taxa_adm', 'retencao', 'abatimento', 'reembolso', 'ajuste'
  )),
  description text,
  -- ASSINADO; negativo é retido.
  amount numeric(12,2) not null,
  -- Liga o item bruto à cobrança que o originou — é o que permite a linha dizer
  -- "referente ao aluguel de setembro" em vez de um número solto.
  source_charge_id uuid,
  reverses_item_id uuid references public.payout_items(id),
  created_at timestamptz not null default now(),
  created_by uuid,

  foreign key (payout_id, tenant_id) references public.owner_payouts (id, tenant_id) on delete cascade,
  foreign key (source_charge_id, tenant_id) references public.contract_charges (id, tenant_id) on delete set null
);

create index if not exists payout_items_tenant_idx
  on public.payout_items (tenant_id, payout_id);

-- ---------------------------------------------------------------------------
-- 7. RLS, policies e grants
--
-- ⚠️ `revoke all from anon` não é formalidade: o Supabase dá GRANT default ao
-- papel `anon`, e a policy sozinha não basta. As migrations 0005, 0011 e 0015
-- existem porque isso falhou uma vez cada.
--
-- ⚠️ `payout_destinations` guarda dado BANCÁRIO de pessoa real, no mesmo banco
-- que serve quatro imobiliárias. É a invariante nº 3 do repositório aplicada a
-- uma tabela que nasce inteira como coluna interna.
--
-- NENHUMA policy para o papel do portal: o cliente não lê estas tabelas na v1.
-- Quando ler, será com uma função de filtro de membro — e aí é outra migration.
-- ---------------------------------------------------------------------------
alter table public.payout_destinations enable row level security;
alter table public.contract_charges    enable row level security;
alter table public.charge_items        enable row level security;
alter table public.charge_settlements  enable row level security;
alter table public.owner_payouts       enable row level security;
alter table public.payout_items        enable row level security;

revoke all on public.payout_destinations from anon;
revoke all on public.contract_charges    from anon;
revoke all on public.charge_items        from anon;
revoke all on public.charge_settlements  from anon;
revoke all on public.owner_payouts       from anon;
revoke all on public.payout_items        from anon;

drop policy if exists "financeiro_destinos_membro" on public.payout_destinations;
create policy "financeiro_destinos_membro" on public.payout_destinations
  for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists "financeiro_cobrancas_membro" on public.contract_charges;
create policy "financeiro_cobrancas_membro" on public.contract_charges
  for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists "financeiro_itens_cobranca_membro" on public.charge_items;
create policy "financeiro_itens_cobranca_membro" on public.charge_items
  for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists "financeiro_liquidacoes_membro" on public.charge_settlements;
create policy "financeiro_liquidacoes_membro" on public.charge_settlements
  for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists "financeiro_repasses_membro" on public.owner_payouts;
create policy "financeiro_repasses_membro" on public.owner_payouts
  for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists "financeiro_itens_repasse_membro" on public.payout_items;
create policy "financeiro_itens_repasse_membro" on public.payout_items
  for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

comment on table public.payout_destinations is
  'Conta ou chave Pix do proprietário. DADO BANCÁRIO — nunca sai em payload público. Ver 0041.';
comment on column public.contract_charges.competence is
  'Primeiro dia do mês de OCUPAÇÃO, não do vencimento. Ver 0041.';
comment on column public.contract_charges.issued_amount is
  'O que foi EMITIDO, congelado. O total corrente é a soma dos itens. Ver 0041.';
comment on column public.charge_settlements.settled_on is
  'Data do pagamento do LOCATÁRIO — data fiscal para IR. Ver 0041.';
