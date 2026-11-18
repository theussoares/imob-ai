-- Desfaz 0062_gestao_locacoes. Apaga os contratos de locação (cobranças, repasses e
-- histórico vivem no `dados` jsonb): só rode se a tabela ainda não tem dado real, ou
-- depois de exportá-la. Os documentos de locação (`gestao_documentos`, alvo_tipo
-- 'locacao') NÃO são apagados aqui e ficariam sem contrato: limpe-os antes se for o caso.
drop table if exists public.gestao_locacoes;
