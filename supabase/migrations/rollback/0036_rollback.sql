-- Rollback da 0036: volta as policies à forma SEM entitlement.
--
-- ⚠️ Depois disto, todo tenant com cliente cadastrado volta a ter portal
-- funcionando, independentemente de plano. A tabela `tenant_features` NÃO é
-- derrubada: ela guarda quem pagou pelo quê, e esse dado não deve sumir num
-- rollback de policy.

drop policy if exists "portal_users_read" on public.portal_users;
create policy "portal_users_read" on public.portal_users
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or user_id = (select auth.uid())
  );

drop policy if exists "contracts_read" on public.contracts;
create policy "contracts_read" on public.contracts
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or id in (
      select cp.contract_id
      from public.contract_parties cp
      join public.portal_users pu on pu.id = cp.portal_user_id
      where pu.user_id = (select auth.uid())
        and pu.active
        and pu.tenant_id = contracts.tenant_id
    )
  );

drop policy if exists "contract_parties_read" on public.contract_parties;
create policy "contract_parties_read" on public.contract_parties
  for select to authenticated using (
    contract_id in (
      select c.id from public.contracts c where public.is_tenant_member(c.tenant_id)
    )
    or portal_user_id in (
      select pu.id from public.portal_users pu
      where pu.user_id = (select auth.uid()) and pu.active
    )
  );

drop policy if exists "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or (
      published_at is not null
      and exists (
        select 1
        from public.contract_parties cp
        join public.portal_users pu on pu.id = cp.portal_user_id
        where cp.contract_id = portal_documents.contract_id
          and pu.user_id = (select auth.uid())
          and pu.active
          and pu.tenant_id = portal_documents.tenant_id
          and cp.role = any (portal_documents.audience)
      )
    )
  );

-- Bucket: volta à 0034 (com a checagem de pasta, sem o entitlement).
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
      join public.tenants t on t.id = d.tenant_id
      where d.storage_path = storage.objects.name
        and (storage.foldername(storage.objects.name))[1] = t.slug
        and d.published_at is not null
        and pu.user_id = (select auth.uid())
        and pu.active
        and pu.tenant_id = d.tenant_id
        and cp.role = any (d.audience)
    )
  );

create or replace function public.is_portal_user(t_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.portal_users pu
    where pu.tenant_id = t_id and pu.user_id = auth.uid() and pu.active
  );
$$;
