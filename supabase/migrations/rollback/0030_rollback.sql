-- ROLLBACK da 0030_revogar_grants_coluna_anon_brokers.sql
--
-- NÃO é migration. Existe só para restaurar o estado anterior enquanto se
-- investiga um problema.
--
-- ⚠️ LEIA ANTES DE RODAR: o estado que este arquivo restaura é uma exposição
-- de dado pessoal. Com estes grants de volta E a `brokers_public_read`
-- recriada (rollback da 0029), nome, CRECI, bio e foto de corretor marcado como
-- público voltam a ser legíveis por qualquer visitante anônimo, de qualquer
-- imobiliária.
--
-- Só rode se a 0030 tiver quebrado algo real — e nenhum caminho do código lê
-- corretor como `anon`, então isso é improvável. Se quebrou, prefira descobrir
-- o quê antes de reabrir.
--
-- Estado capturado de `information_schema.column_privileges` em 2026-09-11,
-- imediatamente antes do apply.

grant select (id, name, creci, bio, photo_url) on public.brokers to anon;
