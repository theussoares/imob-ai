-- ⚠️ IMPORTADA DA PRODUÇÃO — não foi escrita aqui.
--
-- Aplicada direto no banco em 2026-09-12, sem nunca ter sido commitada.
-- Recuperada de `supabase_migrations.schema_migrations` em 2026-09-16, com o
-- SQL exatamente como foi executado.
--
-- Identidade no banco: version=20260912190434, name=corrigir_recursao_policies_portal
--
-- ⚠️ É A MIGRATION MAIS IMPORTANTE DESTA PASTA. Ela substituiu as subqueries
-- inline das policies do portal por funções `security definer`
-- (`portal_my_parties`, `portal_can_read_doc_path`). Qualquer migration futura
-- que recrie `contracts_read`, `contract_parties_read`,
-- `portal_documents_read` ou a policy do bucket no formato da `client_area`
-- **reintroduz a recursão infinita** e derruba o portal inteiro.
--
-- Isso quase aconteceu em 16/09: uma migration escrita contra a pasta do
-- repositório (que não tinha este arquivo) fazia exatamente isso. Foi descartada
-- antes de aplicar, e é por causa dela que esta pasta existe.
--
-- O cabeçalho original também registra, de forma independente, o mesmo achado a
-- que a revisão de segurança chegou depois: a `tenant_features` afirmava que
-- `is_portal_user()` gatilhava as policies, e nenhuma policy a chamava.
--
-- NÃO reaplicar: já está no histórico da produção. Note que
-- `portal_can_read_doc_path` foi ALTERADA depois, pela
-- `portal_documents_caminho_no_banco` (0034), que acrescentou a checagem de
-- pasta. A versão válida hoje é a de lá, não a deste arquivo.

-- 0033 — Recursão infinita nas policies do portal + entitlement que não existia
--
-- 1) 42P17: contracts_read consulta contract_parties, cuja policy consulta
--    contracts de volta. A policy de storage cai no mesmo ciclo. O cliente não
--    lê contrato, não lista documento e não baixa arquivo.
--    Remédio: o lado do cliente passa por função security definer, que não
--    reavalia RLS porque o dono da função é dono das tabelas.
--
-- 2) O entitlement pago não estava no banco: a 0032 afirma que is_portal_user()
--    gatilha as policies do portal, mas nenhuma policy a chamava. Suspender
--    fechava só na aplicação. Agora todo caminho do cliente atravessa a função.
--
-- O caminho da imobiliária (is_tenant_member) não muda em nenhum ponto.

-- ⚠️ NÃO revogue EXECUTE destas funções (mesmo motivo documentado na 0028):
-- expressão de policy roda com a permissão de quem consulta, e sem EXECUTE toda
-- policy que chama a função falha com `permission denied for function`.
create or replace function public.portal_my_parties()
returns table (contract_id uuid, tenant_id uuid, party_role public.contract_party_role)
language sql
stable
security definer
set search_path = public
as $$
  select cp.contract_id, pu.tenant_id, cp.role
  from public.contract_parties cp
  join public.portal_users pu on pu.id = cp.portal_user_id
  where pu.user_id = (select auth.uid())
    and pu.active
    and public.is_portal_user(pu.tenant_id);
$$;

comment on function public.portal_my_parties() is
  'Contratos do cliente autenticado, com papel. Security definer para romper a recursão entre as policies de contracts e contract_parties. Preso a auth.uid().';

create or replace function public.portal_can_read_doc_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_documents d
    join public.portal_my_parties() p
      on p.contract_id = d.contract_id and p.tenant_id = d.tenant_id
    where d.storage_path = p_path
      and d.published_at is not null
      and p.party_role = any (d.audience)
  );
$$;

comment on function public.portal_can_read_doc_path(text) is
  'O cliente autenticado pode ler este objeto do bucket portal-docs? Exige documento publicado e papel dentro de audience.';

drop policy if exists "contracts_read" on public.contracts;
create policy "contracts_read" on public.contracts
  for select to authenticated
  using (
    is_tenant_member(tenant_id)
    or exists (
      select 1 from public.portal_my_parties() p
      where p.contract_id = contracts.id
        and p.tenant_id = contracts.tenant_id
    )
  );

drop policy if exists "contract_parties_read" on public.contract_parties;
create policy "contract_parties_read" on public.contract_parties
  for select to authenticated
  using (
    contract_id in (select c.id from public.contracts c where is_tenant_member(c.tenant_id))
    or portal_user_id in (
      select pu.id from public.portal_users pu
      where pu.user_id = (select auth.uid())
        and pu.active
        and public.is_portal_user(pu.tenant_id)
    )
  );

drop policy if exists "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated
  using (
    is_tenant_member(tenant_id)
    or (
      published_at is not null
      and exists (
        select 1 from public.portal_my_parties() p
        where p.contract_id = portal_documents.contract_id
          and p.tenant_id = portal_documents.tenant_id
          and p.party_role = any (portal_documents.audience)
      )
    )
  );

drop policy if exists "portal client reads own documents" on storage.objects;
create policy "portal client reads own documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portal-docs'
    and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
    and public.portal_can_read_doc_path(name)
  );
