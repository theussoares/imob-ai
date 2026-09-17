-- ROLLBACK da 0031_properties_colunas_internas_authenticated.sql
--
-- NÃO é migration. Existe para o caso de o painel apresentar
-- "permission denied for table properties" depois do apply — sintoma de que
-- algum caminho de leitura do painel ficou no client do usuário em vez de
-- service role.
--
-- ⚠️ O estado restaurado é a brecha: `authenticated` volta a ler owner_name,
-- owner_phone, location, broker_id e updated_by. Aceitável enquanto o único
-- usuário autenticado é a imobiliária. NÃO aceitável depois que existir login
-- de cliente do portal — se precisar rodar isto com o portal no ar, desligue o
-- entitlement do portal (card 0.6) antes.
--
-- Uma linha só: devolver o privilégio de TABELA faz o de coluna virar
-- irrelevante, porque quando os dois coexistem o de tabela prevalece.

grant select on public.properties to authenticated;
