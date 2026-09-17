-- Fecha as colunas internas de `properties` para o papel `authenticated`.
--
-- A 0011 fez isso para `anon` e foi explícita sobre o motivo: `owner_name`,
-- `owner_phone`, `location` e `broker_id` são dados internos. Mas o revoke nunca
-- foi aplicado a `authenticated`, que manteve o GRANT default do Supabase sobre
-- a tabela inteira.
--
-- Hoje isso não vaza: todo usuário autenticado é membro de imobiliária e deve
-- mesmo ver esses campos. Deixa de ser verdade no PRIMEIRO login de inquilino —
-- porque cliente do portal também é `authenticated`. A partir daí, qualquer
-- cliente com senha leria nome e telefone do proprietário de todo imóvel ativo,
-- de TODOS os tenants, usando a chave anônima que vai no HTML somada ao próprio
-- token.
--
-- A policy `properties_public_read` não protege: RLS filtra LINHA, não COLUNA.
--
-- Confirmado por consulta antes de escrever: `authenticated` tinha SELECT nas 27
-- colunas; `anon` nas 22 públicas. São CINCO colunas internas, não quatro — o
-- `updated_by` também estava aberto, e ele revela qual funcionário editou.
--
-- ⚠️ Esta migration NÃO pode ir sozinha. Sem a troca dos endpoints do painel
-- para service role (mesmo commit, mesmo deploy), a listagem e a edição de
-- imóveis quebram com "permission denied for table properties" — o PostgREST
-- expande `select('*')` para todas as colunas e a query inteira falha. É o mesmo
-- erro que a 0005 já documentou para `anon`.

-- Ordem obrigatória: o revoke de tabela primeiro. Privilégio de coluna sozinho
-- não protege nada enquanto o de tabela existir — se os dois coexistem, o de
-- tabela prevalece.
revoke select on public.properties from authenticated;

-- A mesma lista concedida a `anon` na 0005/0011, mais `suites` (0013), que já
-- estava no grant do anon em produção. Deliberadamente FORA da lista:
-- broker_id, location, owner_name, owner_phone, updated_by.
grant select (
  id, tenant_id, code, title, type, purpose, price,
  neighborhood, city, state, bedrooms, suites, bathrooms, parking, area,
  high_standard, description, features, status, featured,
  created_at, updated_at
) on public.properties to authenticated;

-- INSERT, UPDATE e DELETE não são tocados: o painel continua GRAVANDO os campos
-- internos. O que muda é só a leitura, e ela passa a acontecer por service role
-- com filtro de tenant explícito na query.
