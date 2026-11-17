-- Rollback da 0056.
--
-- ⚠️ A ORDEM importa: as linhas `gestao` saem ANTES de reapertar o CHECK.

delete from public.tenant_features where feature = 'gestao';

alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai', 'crm', 'cobranca'));
