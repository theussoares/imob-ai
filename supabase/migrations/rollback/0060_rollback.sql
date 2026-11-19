-- Desfaz 0060_gestao_vendas. Apaga os processos de venda do gestão: só rode se a
-- tabela ainda não tem dado real. O índice de brokers pertence à 0049 e fica.
drop table if exists public.gestao_vendas;
