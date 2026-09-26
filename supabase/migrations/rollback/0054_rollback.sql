-- Rollback da 0054.
--
-- ⚠️ A ORDEM importa: as linhas `crm` saem ANTES de reapertar o CHECK, senão o
-- `add constraint` é validado contra elas e falha.

delete from public.tenant_features where feature = 'crm';

alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai'));
