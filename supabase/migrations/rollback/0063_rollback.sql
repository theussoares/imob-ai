-- Rollback da 0063.
--
-- ⚠️ Apaga o histórico de consultas cadastrais do /gestao (todas simuladas hoje).

drop table if exists public.gestao_consultas;
