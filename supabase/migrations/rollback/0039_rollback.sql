-- Rollback da 0039.
--
-- ⚠️ A ORDEM importa e não é a inversa óbvia. Apagar as linhas `about` tem que
-- vir ANTES de reapertar o CHECK: com linhas `about` na tabela, o
-- `add constraint` é validado contra o que já está lá e falha.
--
-- ⚠️ Isto despublica `/quem-somos` de todo mundo. O código que voltaria junto
-- (antes da 0039) publicava a página para TODA imobiliária — então rodar só
-- este arquivo, sem reverter o app, deixa `about_enabled` sem leitor e o link
-- volta ao rodapé das quatro, que é o defeito que a 0039 existia para impedir.
-- Reverta o app primeiro.

delete from public.tenant_features where feature = 'about';

alter table public.tenant_features
  drop constraint if exists tenant_features_feature_check;

alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature = 'portal');

alter table public.tenants
  drop column if exists about_enabled;
