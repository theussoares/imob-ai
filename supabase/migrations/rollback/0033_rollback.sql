-- =============================================================================
-- ROLLBACK da 0033
--
-- ⚠️ LEIA ANTES DE RODAR. Diferente dos outros rollbacks desta série, este NÃO
-- devolve o banco a um estado bom. As definições abaixo foram capturadas do
-- banco vivo imediatamente antes da 0033 — e o estado capturado É o defeito:
--
--   * o cliente do portal volta a receber `42P17 infinite recursion detected in
--     policy` em contrato, documento e download;
--   * o entitlement pago volta a valer só na aplicação, não no banco.
--
-- Só faz sentido rodar isto se a 0033 tiver causado um problema PIOR que esses
-- dois — e nesse caso o certo é corrigir para frente, com uma 0034.
-- =============================================================================

drop policy if exists "contracts_read" on public.contracts;
create policy "contracts_read" on public.contracts
  for select to authenticated
  using (
    is_tenant_member(tenant_id)
    or (id in (
      select cp.contract_id
      from public.contract_parties cp
      join public.portal_users pu on pu.id = cp.portal_user_id
      where pu.user_id = (select auth.uid()) and pu.active and pu.tenant_id = contracts.tenant_id
    ))
  );

drop policy if exists "contract_parties_read" on public.contract_parties;
create policy "contract_parties_read" on public.contract_parties
  for select to authenticated
  using (
    contract_id in (select c.id from public.contracts c where is_tenant_member(c.tenant_id))
    or portal_user_id in (
      select pu.id from public.portal_users pu
      where pu.user_id = (select auth.uid()) and pu.active
    )
  );

drop policy if exists "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated
  using (
    is_tenant_member(tenant_id)
    or (published_at is not null and exists (
      select 1
      from public.contract_parties cp
      join public.portal_users pu on pu.id = cp.portal_user_id
      where cp.contract_id = portal_documents.contract_id
        and pu.user_id = (select auth.uid())
        and pu.active
        and pu.tenant_id = portal_documents.tenant_id
        and cp.role = any (portal_documents.audience)
    ))
  );

drop policy if exists "portal client reads own documents" on storage.objects;
create policy "portal client reads own documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portal-docs'
    and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
    and exists (
      select 1
      from public.portal_documents d
      join public.contract_parties cp on cp.contract_id = d.contract_id
      join public.portal_users pu on pu.id = cp.portal_user_id
      where d.storage_path = objects.name
        and d.published_at is not null
        and pu.user_id = (select auth.uid())
        and pu.active
        and pu.tenant_id = d.tenant_id
        and cp.role = any (d.audience)
    )
  );

drop function if exists public.portal_can_read_doc_path(text);
drop function if exists public.portal_my_parties();
