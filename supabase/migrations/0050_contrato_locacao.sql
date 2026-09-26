-- Contrato de locação com o que a administração e a cobrança exigem, e
-- cliente que existe sem ter acesso ao portal.
--
-- O sintoma, visto na revisão dos fluxos em 25/09:
--   * cadastrar cliente ERA convidar para a Área do Cliente: e-mail
--     obrigatório e convite disparado na hora. O fiador que nunca vai entrar,
--     e o proprietário que só usa WhatsApp, não tinham como existir;
--   * o contrato não guardava garantia, seguro incêndio, multa, juros, taxa de
--     locação nem prazo de repasse — tudo o que o boleto e o repasse precisam.
-- Ver docs/superpowers/specs/2026-09-25-crm-e-cobranca-design.md, seção 4B,
-- com a base legal de cada limite abaixo.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. Cliente sem acesso ao portal
--
-- `user_id` nulo = a pessoa é cadastro da imobiliária e não tem conta. Isto
-- NÃO abre nada: toda regra de acesso do portal compara `user_id = auth.uid()`
-- (conferido no banco em 25/09 — `is_portal_user`, `portal_my_parties`, a
-- policy `portal_users_read`), e `NULL = x` nunca é verdadeiro. O índice único
-- (tenant_id, user_id) também convive com vários nulos.
--
-- `email` nulo pelo mesmo motivo; o índice único em (tenant_id, lower(email))
-- trata nulos como distintos. Mas quem TEM conta precisa de e-mail: é por ele
-- que o convite e a recuperação de senha chegam.
-- ---------------------------------------------------------------------------
alter table public.portal_users alter column user_id drop not null;
alter table public.portal_users alter column email drop not null;

alter table public.portal_users drop constraint if exists portal_users_acesso_exige_email;
alter table public.portal_users add constraint portal_users_acesso_exige_email
  check (user_id is null or email is not null);

-- ---------------------------------------------------------------------------
-- 2. contracts — o que o cliente do portal também pode ler
-- ---------------------------------------------------------------------------

-- Prazo combinado, em meses. O término continua em `ends_on` (é o que o
-- portal mostra); o prazo existe porque é assim que se negocia ("30 meses") e
-- porque 30 meses muda o direito de retomada (Lei 8.245, art. 46).
alter table public.contracts
  add column if not exists term_months smallint;
alter table public.contracts drop constraint if exists contracts_term_months_check;
alter table public.contracts add constraint contracts_term_months_check
  check (term_months is null or term_months between 1 and 600);

-- UMA garantia por contrato: exigir mais de uma é nulo e contravenção (Lei
-- 8.245, art. 37, parágrafo único). Coluna única com CHECK, e não uma tabela
-- de garantias, justamente para o banco não aceitar duas.
-- 'garantia_empresa' = fiança de empresa garantidora (ex.: CredPago).
-- Nulo = ainda não informada (vira pendência na ficha, não erro).
alter table public.contracts
  add column if not exists guarantee_type text;
alter table public.contracts drop constraint if exists contracts_guarantee_type_check;
alter table public.contracts add constraint contracts_guarantee_type_check check (
  guarantee_type is null or guarantee_type in (
    'nenhuma', 'fiador', 'caucao', 'seguro_fianca', 'titulo_capitalizacao', 'garantia_empresa'
  )
);

-- ---------------------------------------------------------------------------
-- 3. contract_internal — o que é da imobiliária e o portal nunca lê
--
-- Aqui e não em `contracts` porque `contracts` é lida pelo cliente do portal
-- (policy `contracts_read`). Taxa é margem da imobiliária; multa e juros ele
-- conhece pelo contrato assinado e pelo boleto, não por consulta à tabela.
-- ---------------------------------------------------------------------------
alter table public.contract_internal
  -- Caução em dinheiro: até 3 aluguéis (art. 38, §2º) — conferido no endpoint,
  -- que conhece o aluguel; aqui só não aceita negativo.
  add column if not exists guarantee_amount numeric(12,2),
  -- Seguradora, apólice, validade, nome do fiador de fora da carteira.
  add column if not exists guarantee_details text,
  -- Seguro incêndio é obrigação do LOCADOR salvo cláusula em contrário (art.
  -- 22, VIII). Nulo = não informado.
  add column if not exists fire_insurance_payer text,
  -- Multa moratória e juros de mora: vão impressos no boleto.
  add column if not exists fine_percent numeric(5,2),
  add column if not exists interest_monthly_percent numeric(5,2),
  -- Taxa de locação (intermediação), em % do PRIMEIRO aluguel.
  add column if not exists rent_fee_percent numeric(5,2),
  -- Repasse ao proprietário, em dias úteis após o pagamento do inquilino.
  add column if not exists payout_business_days smallint;

alter table public.contract_internal drop constraint if exists contract_internal_guarantee_amount_check;
alter table public.contract_internal add constraint contract_internal_guarantee_amount_check
  check (guarantee_amount is null or guarantee_amount >= 0);

alter table public.contract_internal drop constraint if exists contract_internal_fire_insurance_check;
alter table public.contract_internal add constraint contract_internal_fire_insurance_check
  check (fire_insurance_payer is null or fire_insurance_payer in ('locador', 'locatario', 'nao_contratado'));

-- Tetos: multa até 10% (a locação não segue o CDC, e 10% é o teto que os
-- tribunais aceitam), juros até 1% ao mês. Um CHECK aqui e não só no
-- validador: o boleto é emitido a partir destes números.
alter table public.contract_internal drop constraint if exists contract_internal_fine_check;
alter table public.contract_internal add constraint contract_internal_fine_check
  check (fine_percent is null or (fine_percent >= 0 and fine_percent <= 10));

alter table public.contract_internal drop constraint if exists contract_internal_interest_check;
alter table public.contract_internal add constraint contract_internal_interest_check
  check (interest_monthly_percent is null or (interest_monthly_percent >= 0 and interest_monthly_percent <= 1));

alter table public.contract_internal drop constraint if exists contract_internal_rent_fee_check;
alter table public.contract_internal add constraint contract_internal_rent_fee_check
  check (rent_fee_percent is null or (rent_fee_percent >= 0 and rent_fee_percent <= 100));

alter table public.contract_internal drop constraint if exists contract_internal_payout_days_check;
alter table public.contract_internal add constraint contract_internal_payout_days_check
  check (payout_business_days is null or payout_business_days between 0 and 30);

comment on column public.portal_users.user_id is
  'Conta no Auth. NULO = cliente sem acesso ao portal (cadastro da imobiliária). Ver 0050.';
comment on column public.contracts.guarantee_type is
  'UMA garantia por contrato (Lei 8.245, art. 37, par. único). Ver 0050.';
