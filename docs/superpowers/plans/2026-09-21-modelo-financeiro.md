# Modelo de dados financeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** criar seis tabelas financeiras vazias, com RLS e integridade de tenant,
de modo que o primeiro boleto não exija migração de dado.

**Architecture:** uma migration idempotente (`0041`), um teste de guardrail em
vitest que lê o SQL e trava os invariantes de segurança, e a verificação do
schema vivo depois de aplicar. Nenhuma lógica, endpoint ou tela.

**Tech Stack:** Postgres via Supabase, SQL puro, Vitest em Node puro (sem banco).

**Spec:** [docs/superpowers/specs/2026-09-21-modelo-financeiro-design.md](../specs/2026-09-21-modelo-financeiro-design.md)

## Global Constraints

- Comentários, mensagens de commit e nomes de domínio em **português**;
  identificadores de código em inglês.
- Comentário explica **por quê**, com a alternativa descartada e o custo.
  Comentário que narra o código é defeito neste repositório.
- Migration **idempotente sempre** (`if not exists`, `drop policy if exists`
  antes de `create policy`), com comentário no topo explicando o porquê.
- Valor monetário é `numeric(12,2)`; percentual é `numeric(5,2)`.
- **`text` com CHECK, nunca enum nativo.** A spec registra que as listas de
  `kind` podem estar erradas e precisam de validação com quem opera uma carteira
  de locação. Corrigir um CHECK é `drop` e `create`; **valor de enum não se
  remove**.
- Toda tabela: `tenant_id not null`, `enable row level security`,
  **`revoke all ... from anon`**, e policy por `is_tenant_member(tenant_id)`.
- **Nenhuma policy para o papel do portal.** O cliente não lê estas tabelas na v1.
- O Supabase é o **mesmo de produção**, com quatro imobiliárias reais (`demo`,
  `olmi`, `tatiane`, `tres-lagoas`). Nada aqui toca dado existente.

---

### Task 1: A migration e o guardrail que a trava

Teste primeiro: ele lê o arquivo SQL e falha enquanto o arquivo não existe. Só
então a migration. O guardrail vive em `pnpm test` (Node puro, segundos) e não
precisa de banco — é o mesmo padrão de `public-payload-guardrail.test.ts`.

**Files:**
- Create: `test/server/financeiro-guardrail.test.ts`
- Create: `supabase/migrations/0041_modelo_financeiro.sql`
- Create: `supabase/migrations/rollback/0041_rollback.sql`

**Interfaces:**
- Consumes: `is_tenant_member(uuid)`, que já existe no banco.
- Produces: as tabelas `payout_destinations`, `contract_charges`, `charge_items`,
  `charge_settlements`, `owner_payouts`, `payout_items`.

- [ ] **Step 1: Escrever o guardrail**

Criar `test/server/financeiro-guardrail.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * As invariantes de segurança da 0041, travadas por leitura do SQL.
 *
 * Este teste não toca banco — é o mesmo padrão de
 * `public-payload-guardrail.test.ts`, e pelo mesmo motivo: a regra precisa ser
 * verificável em `pnpm test`, que roda em segundos e portanto roda sempre.
 *
 * A ameaça que ele cobre: seis tabelas novas, todas com dado interno, sendo uma
 * delas (`payout_destinations`) com dado BANCÁRIO de pessoa real, num banco
 * compartilhado por quatro imobiliárias. Esquecer um `revoke` ou um `tenant_id`
 * numa delas não quebra nada visivelmente — só abre a porta.
 */

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0041_modelo_financeiro.sql'),
  'utf8',
)

const TABELAS = [
  'payout_destinations',
  'contract_charges',
  'charge_items',
  'charge_settlements',
  'owner_payouts',
  'payout_items',
] as const

/** As que penduram num pai e precisam de FK composta com `tenant_id`. */
const FILHAS = ['charge_items', 'charge_settlements', 'payout_items'] as const

describe('0041 — toda tabela nasce fechada', () => {
  for (const t of TABELAS) {
    test(`${t}: existe, tem tenant_id e RLS`, () => {
      expect(SQL).toContain(`create table if not exists public.${t}`)
      expect(SQL).toMatch(
        new RegExp(`create table if not exists public\\.${t}[\\s\\S]*?tenant_id uuid not null`),
      )
      // `\s+` e não espaço único: o SQL alinha as colunas destes blocos para
      // ficarem legíveis, e um regex rígido falharia por formatação.
      expect(SQL).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
    })

    test(`${t}: revoke do anon`, () => {
      // A policy sozinha não basta: o Supabase dá GRANT default ao `anon`, e as
      // migrations 0005, 0011 e 0015 existem porque isso falhou uma vez cada.
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon`))
    })

    test(`${t}: policy de membro`, () => {
      expect(SQL).toMatch(new RegExp(`on public\\.${t}[\\s\\S]{0,400}is_tenant_member`))
    })

    test(`${t}: índice começando por tenant_id`, () => {
      // A RLS acrescenta o predicado de tenant a toda consulta; índice que não
      // começa por ele não é usado.
      expect(SQL).toMatch(new RegExp(`create index if not exists[^;]*on public\\.${t} \\(tenant_id`))
    })
  }

  test('NENHUMA policy do portal, em nenhuma das seis', () => {
    // O cliente não lê estas tabelas na v1. Se um dia ler, a régua é
    // `portal_my_parties()` — e aí é outra migration, com sua própria revisão.
    //
    // Checagem no arquivo INTEIRO, e não por tabela: a primeira versão deste
    // teste fatiava o SQL a partir da primeira ocorrência de
    // `on public.<tabela>`, que cai num índice e não na policy — passava sem
    // testar nada.
    expect(SQL).not.toContain('portal_my_parties')
    expect(SQL).not.toContain('is_portal_user')
  })
})

describe('0041 — integridade de tenant entre pai e filha', () => {
  for (const t of FILHAS) {
    test(`${t}: FK composta com tenant_id`, () => {
      // Sem ela, uma linha poderia ter tenant_id de A apontando para pai de B —
      // e a invariante nº 1 do repositório cairia dentro da própria tabela
      // escrita para respeitá-la.
      const bloco = SQL.split(`create table if not exists public.${t}`)[1]?.split(');')[0] ?? ''
      expect(bloco).toMatch(/foreign key \([a-z_]+_id, tenant_id\) references/)
    })
  }

  test('os pais têm o unique que a FK composta exige', () => {
    for (const pai of ['contract_charges', 'owner_payouts', 'portal_users', 'contracts']) {
      expect(SQL).toMatch(new RegExp(`create unique index if not exists[^;]*on public\\.${pai} \\(id, tenant_id\\)`))
    }
  })
})

describe('0041 — o que a spec decidiu, travado', () => {
  test('listas fechadas são CHECK, não enum', () => {
    // A spec registra que as listas de `kind` podem estar erradas e precisam de
    // validação com quem opera. Corrigir CHECK é drop+create; valor de enum não
    // se remove.
    expect(SQL).not.toMatch(/create type public\.(charge|payout|settlement)/)
    expect(SQL).toMatch(/check \(kind in \(/)
  })

  test('dinheiro é numeric(12,2)', () => {
    const colunas = SQL.match(/^\s+(amount|issued_amount) [a-z0-9(),]+/gm) ?? []
    expect(colunas.length).toBeGreaterThan(0)
    for (const c of colunas) expect(c).toContain('numeric(12,2)')
  })

  test('a chave de idempotência é única', () => {
    // É o que impede um webhook reenviado de duplicar pagamento.
    expect(SQL).toMatch(/idempotency_key text unique/)
  })

  test('as linhas de valor não têm updated_at', () => {
    // Append-only: correção é linha nova apontando para a que estorna.
    for (const t of ['charge_items', 'charge_settlements', 'payout_items']) {
      const bloco = SQL.split(`create table if not exists public.${t}`)[1]?.split(');')[0] ?? ''
      expect(bloco, `${t} não pode ter updated_at`).not.toContain('updated_at')
      expect(bloco).toMatch(/reverses_[a-z]+_id uuid/)
    }
  })

  test('competence carrega o aviso de que é mês de ocupação', () => {
    // Quem confundir com o mês do vencimento não quebra a aplicação: quebra o
    // DIMOB e o informe de rendimentos, sem erro em tempo de execução.
    expect(SQL).toMatch(/competence[\s\S]{0,200}ocupa/i)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run test/server/financeiro-guardrail.test.ts`
Expected: FAIL — `ENOENT`, o arquivo da migration não existe.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/0041_modelo_financeiro.sql`:

```sql
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

  foreign key (portal_user_id, tenant_id)
    references public.portal_users (id, tenant_id) on delete cascade,
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

  foreign key (contract_id, tenant_id)
    references public.contracts (id, tenant_id) on delete cascade,
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

  -- Sem `updated_at`: a linha nunca muda. Correção é linha nova apontando para
  -- a que estorna.
  foreign key (charge_id, tenant_id)
    references public.contract_charges (id, tenant_id) on delete cascade
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

  foreign key (charge_id, tenant_id)
    references public.contract_charges (id, tenant_id) on delete cascade
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

  foreign key (contract_id, tenant_id)
    references public.contracts (id, tenant_id) on delete cascade,
  foreign key (destination_id, tenant_id)
    references public.payout_destinations (id, tenant_id) on delete restrict,
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

  foreign key (payout_id, tenant_id)
    references public.owner_payouts (id, tenant_id) on delete cascade,
  foreign key (source_charge_id, tenant_id)
    references public.contract_charges (id, tenant_id) on delete set null
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
-- Quando ler, a régua é `portal_my_parties()` — e aí é outra migration.
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
```

- [ ] **Step 4: Rodar o guardrail e ver passar**

Run: `pnpm vitest run test/server/financeiro-guardrail.test.ts`
Expected: PASS em todos.

Se algum falhar, é o guardrail fazendo o trabalho — corrija o SQL, não o teste.

- [ ] **Step 5: Provar que o guardrail sabe falhar**

Obrigatório, e escolha o que prova mais: remova temporariamente **uma** linha de
`revoke all on public.payout_destinations from anon`, rode, e confirme que o
teste `payout_destinations: revoke do anon` fica vermelho. Desfaça e rode de novo.

Registre a mensagem de falha exata. Um guardrail cuja falha ninguém observou não
prova nada — e este cobre a tabela com dado bancário.

- [ ] **Step 6: Escrever o rollback**

Criar `supabase/migrations/rollback/0041_rollback.sql`:

```sql
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
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `pnpm test && pnpm typecheck`
Expected: todos os testes anteriores passando, 0 erros de tipo. A migration é SQL
e não afeta typecheck; isto confirma que o arquivo de teste novo não quebrou nada.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0041_modelo_financeiro.sql \
        supabase/migrations/rollback/0041_rollback.sql \
        test/server/financeiro-guardrail.test.ts
git commit -m "feat(financeiro): seis tabelas vazias, com RLS e integridade de tenant"
```

---

### Task 2: Aplicar e verificar o schema vivo

⚠️ **Esta tarefa escreve DDL no Supabase de PRODUÇÃO**, compartilhado por quatro
imobiliárias reais. Só executar com aprovação humana explícita. Nenhum passo
aqui toca dado existente — são `create table` e `create index`.

**Files:** nenhum. Esta tarefa é verificação.

**Interfaces:**
- Consumes: `supabase/migrations/0041_modelo_financeiro.sql` da Task 1.
- Produces: as tabelas existindo no banco.

- [ ] **Step 1: Pedir aprovação e aplicar**

Aplicar o conteúdo de `0041_modelo_financeiro.sql`, pelo fluxo que o time usa
(SQL Editor do Supabase, CLI, ou a ferramenta de migration do MCP).

- [ ] **Step 2: Conferir que as seis existem, com RLS**

```sql
select c.relname as tabela, c.relrowsecurity as rls_ligada
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('payout_destinations','contract_charges','charge_items',
                    'charge_settlements','owner_payouts','payout_items')
order by 1;
```

Expected: 6 linhas, `rls_ligada` = true em todas.

- [ ] **Step 3: Conferir que o `anon` não tem NADA**

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('payout_destinations','contract_charges','charge_items',
                     'charge_settlements','owner_payouts','payout_items');
```

Expected: **zero linhas.** Qualquer linha aqui é falha de segurança, não detalhe.

- [ ] **Step 4: Conferir as FKs compostas**

```sql
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where contype = 'f'
  and conrelid::regclass::text in ('charge_items','charge_settlements','payout_items',
                                   'owner_payouts','payout_destinations')
order by 1, 2;
```

Expected: cada filha com uma FK citando `(… , tenant_id)`. Uma FK que referencie
só o id do pai é o buraco que a Task 1 existe para fechar.

- [ ] **Step 5: Conferir que nada ficou com dado**

```sql
select 'contract_charges' t, count(*) from public.contract_charges
union all select 'charge_items', count(*) from public.charge_items
union all select 'charge_settlements', count(*) from public.charge_settlements
union all select 'owner_payouts', count(*) from public.owner_payouts
union all select 'payout_items', count(*) from public.payout_items
union all select 'payout_destinations', count(*) from public.payout_destinations;
```

Expected: zero em todas. As tabelas nascem vazias — esta migration não semeia nada.

- [ ] **Step 6: Conferir que os quatro tenants reais seguem intactos**

```sql
select slug from public.tenants order by slug;
```

Expected: `demo`, `olmi`, `tatiane`, `tres-lagoas`. A migration não toca `tenants`,
e isto é a confirmação de que não tocou mesmo.

---

### Task 3: Tipos e documentação

**Files:**
- Modify: `shared/types/database.types.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: as tabelas aplicadas na Task 2.
- Produces: tipos das seis tabelas disponíveis para o código futuro.

- [ ] **Step 1: Regerar os tipos**

Usar a ferramenta de geração de tipos do Supabase para o projeto, e substituir
`shared/types/database.types.ts` pelo resultado.

Se a geração não estiver disponível, acrescentar as seis tabelas à mão, seguindo
o formato das existentes (blocos `Row`, `Insert`, `Update`, em ordem alfabética
de coluna).

- [ ] **Step 2: Conferir que o typecheck segue limpo**

Run: `pnpm typecheck`
Expected: 0 erros. Nenhum código usa as tabelas ainda, então o único risco é a
geração ter mexido em tipo já usado — e é isso que este passo detecta.

- [ ] **Step 3: Registrar no `CLAUDE.md`**

Na seção **Arquitetura em camadas**, dentro do bloco de `supabase/migrations/`,
acrescentar uma linha após a descrição existente:

```
Tabelas financeiras (0041) existem VAZIAS e sem lógica: cobrança, liquidação,
repasse e destino de pagamento. Ver a spec antes de escrever a primeira query —
`competence` é mês de ocupação, não de vencimento, e as linhas de valor são
append-only.
```

- [ ] **Step 4: Rodar a suíte e commitar**

```bash
pnpm test && pnpm typecheck
git add shared/types/database.types.ts CLAUDE.md
git commit -m "chore(financeiro): tipos das tabelas novas e nota no CLAUDE.md"
```

---

## Depois do plano

Duas coisas que a spec registra e que **não** estão neste plano, de propósito:

**As listas de `kind` precisam de validação humana.** Três valores desta spec
nasceram errados por inferência — `ir_retido`, a ausência de conta de pagamento e
a ausência do ISPB. Todos foram corrigidos por checagem, mas as listas de
`charge_items.kind` e `payout_items.kind` são prática de mercado, não norma
pública. Vinte minutos com quem opera uma carteira de locação valem mais que
outra rodada de pesquisa — e enquanto isso não acontece, o CHECK (em vez de enum)
é o que mantém a correção barata.

**`properties` não tem logradouro nem número.** O DIMOB vai precisar. `tenants`
ganhou endereço estruturado na 0028; `properties` ficou para trás. É coluna em
tabela existente, com impacto no site público e no schema.org — decisão própria,
não extensão desta.
