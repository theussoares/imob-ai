-- ROLLBACK da 0029_reconciliar_producao.sql
--
-- NÃO é migration. Não roda em sequência, não entra em `db push`. Existe para o
-- caso de a 0029 se comportar de forma inesperada em produção e ser preciso
-- voltar ao estado anterior enquanto se investiga.
--
-- As definições abaixo foram capturadas de `pg_policies` e de
-- `information_schema.role_table_grants` em 2026-09-11, imediatamente antes do
-- apply — não são reconstrução de memória.
--
-- Nota: a 0029 não altera nenhum dado. Só policy e privilégio. Não há nada para
-- restaurar além das regras de acesso.

-- ---------------------------------------------------------------------------
-- 1) Policies de `brokers` como estavam
--
-- Eram quatro, todas com role `{public}` (sem cláusula `to`).
-- ---------------------------------------------------------------------------
drop policy if exists "brokers_member_all" on public.brokers;

create policy "brokers_member_all" on public.brokers
  for all
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

create policy "brokers_member_read" on public.brokers
  for select
  using (public.is_tenant_member(tenant_id));

create policy "brokers_member_write" on public.brokers
  for all
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- A policy sem filtro de tenant. Restaurada aqui apenas para fidelidade ao
-- estado anterior — se o rollback for usado, ela volta a permitir leitura
-- cross-tenant de corretor por usuário autenticado.
create policy "brokers_public_read" on public.brokers
  for select
  using (active = true and public_visible = true);

-- ---------------------------------------------------------------------------
-- 2) Privilégios de `anon` em `leads` como estavam
--
-- O estado anterior era: DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE.
-- Não havia INSERT (removido pela 0015).
-- ---------------------------------------------------------------------------
grant select, update, delete, truncate, references, trigger on public.leads to anon;

-- ---------------------------------------------------------------------------
-- 3) `tenant_members_self_read` como estava
--
-- Sem `to authenticated` e com `auth.uid()` fora de subselect.
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_members_self_read" on public.tenant_members;
create policy "tenant_members_self_read" on public.tenant_members
  for select
  using (user_id = auth.uid() or public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 4) As colunas de `brokers` NÃO são revertidas
--
-- `photo_url`, `bio` e `public_visible` já existiam em produção antes da 0029 —
-- ela apenas as versionou com `add column if not exists`, o que foi um no-op
-- naquele banco. Não há o que desfazer, e derrubá-las seria destrutivo.
-- ---------------------------------------------------------------------------
