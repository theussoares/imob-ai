-- Rollback da 0045.
--
-- ⚠️ A ORDEM importa. Apagar as linhas `ai` tem que vir ANTES de reapertar o
-- CHECK: com linhas `ai` na tabela, o `add constraint` é validado contra o que
-- já está lá e falha.
--
-- ⚠️ Dropar `ai_generations` APAGA o histórico de consumo, que é base de
-- cobrança. Exporte antes se houver qualquer linha `concluida`.

drop function if exists public.reservar_geracao_ia(uuid, uuid, uuid, text, text, int, int);
drop table if exists public.ai_generations;

delete from public.tenant_features where feature = 'ai';

alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about'));

alter table public.tenants drop constraint if exists tenants_ai_tone_check;
alter table public.tenants drop column if exists ai_tone;
