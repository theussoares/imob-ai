-- Rollback da 0038.
--
-- ⚠️ Apaga a configuração de remetente de todos os tenants. Quem tinha domínio
-- dedicado volta a enviar pelo domínio da plataforma — o código já faz isso
-- sozinho quando não há linha, então o rollback do banco não exige rollback do
-- app. Mas a informação de QUAL era o endereço se perde: anote antes.

drop table if exists public.tenant_mail_sender;
