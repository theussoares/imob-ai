-- Reconcilia produção com as migrations, e fecha o que ficou aberto.
--
-- Contexto: a 0011 já foi escrita uma vez por este motivo — "o banco de produção
-- foi alterado à mão e as migrations ficaram para trás". Aconteceu de novo, e
-- desta vez foi encontrado por auditoria antes de virar problema.
--
-- Todo o drift está na tabela `brokers`, e conta uma história coerente: alguém
-- começou um "perfil público de corretor" direto no dashboard — foto, bio, um
-- flag de visibilidade e uma policy de leitura pública — e isso nunca foi
-- versionado nem ligado ao código.
--
-- Tudo idempotente: seguro rodar em produção (onde parte já existe) e num banco
-- limpo (onde nada existe).

-- ---------------------------------------------------------------------------
-- 1) As três colunas órfãs de `brokers`
--
-- Existem em produção, não existem em migration nenhuma, e NENHUMA delas é lida
-- ou escrita por uma linha de código deste repositório.
--
-- Ficam, em vez de serem derrubadas, pelo mesmo critério já aplicado a
-- `tenants.website`: apagar coluna com dado dentro é destrutivo e não devolve
-- nada. Se o perfil público de corretor voltar como pauta, elas estão aqui. Se
-- não voltar, custam zero.
-- ---------------------------------------------------------------------------
alter table public.brokers
  add column if not exists photo_url text,
  add column if not exists bio text,
  add column if not exists public_visible boolean not null default false;

comment on column public.brokers.photo_url is
  'Órfã: criada fora de migration, sem uso no código. Ver 0029.';
comment on column public.brokers.bio is
  'Órfã: criada fora de migration, sem uso no código. Ver 0029.';
comment on column public.brokers.public_visible is
  'Órfã: criada fora de migration, sem uso no código. A policy que a lia foi removida em 0029.';

-- ---------------------------------------------------------------------------
-- 2) `brokers_public_read` — a policy que precisava sair
--
-- Em produção existia:
--     for select using (active = true and public_visible = true)
--
-- Sem filtro de tenant. Como `authenticated` tem grant de SELECT na tabela,
-- qualquer usuário logado lia o corretor "público" de QUALQUER imobiliária —
-- nome, telefone, e-mail e CRECI. Hoje isso alcança 1 registro entre 3 tenants;
-- com a Área do Cliente no ar, passaria de "um punhado de corretores vê" para
-- "todo inquilino e todo proprietário de toda imobiliária vê".
--
-- Sai em vez de ser corrigida porque é código morto: os dois endpoints públicos
-- que leem corretor (`/api/properties` e `/api/properties/[code]`) usam
-- `serviceSupabase()`, que ignora RLS. Nenhum caminho anônimo depende dela.
--
-- Se o perfil público de corretor voltar, a policy volta COM filtro de tenant.
-- ---------------------------------------------------------------------------
drop policy if exists "brokers_public_read" on public.brokers;

-- ---------------------------------------------------------------------------
-- 3) As policies de `brokers`, consolidadas
--
-- Produção tinha QUATRO policies permissivas na mesma tabela — `brokers_member_all`
-- (não versionada), `brokers_member_read`, `brokers_member_write` e a pública.
-- As três de membro dizem a mesma coisa, e policy permissiva extra roda em toda
-- query da tabela (advisor 0006, que acusa 30 ocorrências neste banco).
--
-- Uma só, cobrindo as quatro operações. `to authenticated` faz a policy nem ser
-- avaliada para `anon`, que não tem grant nesta tabela desde a 0011.
-- ---------------------------------------------------------------------------
drop policy if exists "brokers_member_all" on public.brokers;
drop policy if exists "brokers_member_read" on public.brokers;
drop policy if exists "brokers_member_write" on public.brokers;

create policy "brokers_member_all" on public.brokers
  for all to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 4) `leads` — tirar do `anon` o que a 0011 já tinha tirado das outras tabelas
--
-- O papel `anon` mantinha SELECT, UPDATE e DELETE de tabela em `leads`. Na
-- prática a RLS segurava (todas as policies exigem `is_tenant_member`), mas não
-- havia segunda barreira: uma policy escrita errada no futuro viraria exposição
-- de PII de lead no mesmo instante.
--
-- A 0011 fez exatamente este revoke em `brokers` e `properties`; `leads` ficou
-- de fora. A escrita pública de lead continua funcionando: ela passa por
-- `serviceSupabase()` desde a 0015, nunca pelo papel anônimo.
-- ---------------------------------------------------------------------------
revoke all on public.leads from anon;

-- ---------------------------------------------------------------------------
-- 5) `tenant_members_self_read` — a chamada de função por linha
--
-- Advisor 0003 (auth_rls_initplan): `auth.uid()` solto é avaliado uma vez por
-- LINHA; dentro de um subselect, uma vez por QUERY. A documentação é explícita
-- em dizer que não há desvantagem em aplicar isso sempre.
--
-- É o único caso de initplan que sobrou neste banco.
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_members_self_read" on public.tenant_members;
create policy "tenant_members_self_read" on public.tenant_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 6) O que NÃO foi feito aqui, e por quê
--
-- Advisors 0028/0029 apontam `is_tenant_member` e `is_member_of_slug` como
-- funções `security definer` chamáveis por RPC em /rest/v1/rpc/.
--
-- O remédio óbvio — `revoke execute` — **derruba a aplicação inteira**. Foi
-- testado neste banco, em schema isolado e descartável: expressão de policy roda
-- com a permissão de quem consulta, o privilégio de EXECUTE é verificado, e sem
-- ele toda policy que chama a função falha com `permission denied for function`.
-- Como `is_tenant_member` gatilha 20 policies, o resultado seria catálogo
-- público e painel fora do ar ao mesmo tempo.
--
-- O remédio correto é a outra saída que o próprio advisor lista: mover as
-- funções para um schema que o PostgREST não expõe (`private`), mantendo
-- EXECUTE. Isso exige reescrever todas as policies que as referenciam — mudança
-- grande, mecânica e arriscada, que não cabe no mesmo passo que fecha brechas.
--
-- Fica como dívida registrada, e com prioridade honesta: o vazamento real é
-- nulo. As duas funções respondem "VOCÊ é membro deste tenant?" / "VOCÊ é membro
-- deste slug?" — informação que o próprio chamador já tem. Não revelam nada
-- sobre terceiros, e para `anon` retornam sempre false.
-- ---------------------------------------------------------------------------
