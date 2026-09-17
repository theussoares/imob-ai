-- O resto do revoke que a 0011 não alcançou — e que era exposição real.
--
-- Encontrado ao VERIFICAR o efeito da 0029 em produção, não ao planejá-la: o
-- teste de "o anon consegue ler brokers?" voltou com 0 linhas em vez de erro de
-- permissão. Zero linhas era o resultado seguro, mas o caminho estar aberto não
-- era o esperado — e a diferença entre "a policy não deixa" e "não tem
-- privilégio" é a diferença entre uma barreira e duas.
--
-- A causa: a 0011 fez `revoke all on public.brokers from anon` para fechar a
-- tabela ao papel anônimo, mas privilégio de COLUNA é independente do de TABELA
-- e sobrevive a esse revoke. O `anon` mantinha SELECT em `id`, `name`, `creci`,
-- `bio` e `photo_url` — concedido fora de migration, junto com o perfil público
-- de corretor que nunca foi versionado (ver 0029).
--
-- O que isso significava na prática, até a 0029 rodar: somado à policy
-- `brokers_public_read` (`active and public_visible`, sem filtro de tenant),
-- qualquer visitante do site — usando a chave anônima que vai no HTML de toda
-- página — lia nome, CRECI, bio e foto de corretor marcado como público, de
-- QUALQUER imobiliária da plataforma. Telefone e e-mail não estavam no grant,
-- então esses não saíam.
--
-- A 0029 fechou pela policy. Esta fecha pelo privilégio, que é a barreira que
-- sobrevive a alguém recriar uma policy pública sem pensar.
--
-- Seguro: nenhum caminho do código lê corretor como `anon`. Os dois endpoints
-- públicos que exibem telefone de captador (`/api/properties` e
-- `/api/properties/[code]`) usam `serviceSupabase()`, que ignora RLS.

revoke select (id, name, creci, bio, photo_url) on public.brokers from anon;

-- Cinto e suspensório: pega qualquer privilégio de coluna concedido fora de
-- migration depois desta, que o revoke nominal acima não cobriria.
revoke all on public.brokers from anon;
