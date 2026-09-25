-- Rollback da 0050.
--
-- ⚠️ Perde dado: garantia, seguro, multa, juros, taxa de locação e prazo de
-- repasse dos contratos. E FALHA se já existir cliente sem acesso (user_id ou
-- email nulos) — apague ou dê acesso a eles antes, porque o NOT NULL não volta
-- com linha nula na tabela. Rode só com o código anterior à 0050 em produção.

alter table public.contract_internal
  drop constraint if exists contract_internal_payout_days_check,
  drop constraint if exists contract_internal_rent_fee_check,
  drop constraint if exists contract_internal_interest_check,
  drop constraint if exists contract_internal_fine_check,
  drop constraint if exists contract_internal_fire_insurance_check,
  drop constraint if exists contract_internal_guarantee_amount_check,
  drop column if exists payout_business_days,
  drop column if exists rent_fee_percent,
  drop column if exists interest_monthly_percent,
  drop column if exists fine_percent,
  drop column if exists fire_insurance_payer,
  drop column if exists guarantee_details,
  drop column if exists guarantee_amount;

alter table public.contracts
  drop constraint if exists contracts_guarantee_type_check,
  drop constraint if exists contracts_term_months_check,
  drop column if exists guarantee_type,
  drop column if exists term_months;

alter table public.portal_users drop constraint if exists portal_users_acesso_exige_email;
alter table public.portal_users alter column email set not null;
alter table public.portal_users alter column user_id set not null;
