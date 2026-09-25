-- Rollback da 0046.
--
-- ⚠️ Apaga o histórico de cliques no WhatsApp. Os leads criados a partir deles
-- continuam, só perdem o vínculo com o clique.

drop table if exists public.whatsapp_clicks;
