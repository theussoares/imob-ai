-- Rollback da 0034.
--
-- ⚠️ Reverter reabre o caminho descrito na 0034: um membro do painel volta a
-- poder registrar um documento apontando para o arquivo de outra imobiliária,
-- pelo PostgREST, sem passar pelo endpoint. Só reverta se a 0034 estiver
-- causando problema maior que isso.

drop trigger if exists trg_portal_documents_caminho on public.portal_documents;
drop function if exists public.portal_documents_valida_caminho();

-- Volta a policy da 0028, SEM a checagem de pasta.
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
      where d.storage_path = storage.objects.name
        and d.published_at is not null
        and pu.user_id = (select auth.uid())
        and pu.active
        and pu.tenant_id = d.tenant_id
        and cp.role = any (d.audience)
    )
  );
