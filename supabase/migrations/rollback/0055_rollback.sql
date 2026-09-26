-- Rollback da 0055.
--
-- ⚠️ A ORDEM importa: as linhas `cobranca` saem ANTES de reapertar o CHECK.

delete from public.tenant_features where feature = 'cobranca';

alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai', 'crm'));
