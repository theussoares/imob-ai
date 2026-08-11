-- Helper: is the current auth user a member of the given tenant?
create or replace function public.is_tenant_member(t_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = t_id and m.user_id = auth.uid()
  );
$$;

alter table public.tenants         enable row level security;
alter table public.tenant_domains  enable row level security;
alter table public.tenant_members  enable row level security;
alter table public.properties      enable row level security;
alter table public.property_images enable row level security;
alter table public.leads           enable row level security;

-- tenants
create policy "tenants_public_read" on public.tenants
  for select using (active = true or public.is_tenant_member(id));
create policy "tenants_member_update" on public.tenants
  for update using (public.is_tenant_member(id)) with check (public.is_tenant_member(id));

-- tenant_domains
create policy "tenant_domains_member_read" on public.tenant_domains
  for select using (public.is_tenant_member(tenant_id));
create policy "tenant_domains_member_write" on public.tenant_domains
  for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

-- tenant_members
create policy "tenant_members_self_read" on public.tenant_members
  for select using (user_id = auth.uid() or public.is_tenant_member(tenant_id));

-- properties
create policy "properties_public_read" on public.properties
  for select using (status = 'active' or public.is_tenant_member(tenant_id));
create policy "properties_member_insert" on public.properties
  for insert with check (public.is_tenant_member(tenant_id));
create policy "properties_member_update" on public.properties
  for update using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy "properties_member_delete" on public.properties
  for delete using (public.is_tenant_member(tenant_id));

-- property_images
create policy "property_images_public_read" on public.property_images
  for select using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and (p.status = 'active' or public.is_tenant_member(p.tenant_id))
    )
  );
create policy "property_images_member_write" on public.property_images
  for all using (
    exists (select 1 from public.properties p where p.id = property_id and public.is_tenant_member(p.tenant_id))
  ) with check (
    exists (select 1 from public.properties p where p.id = property_id and public.is_tenant_member(p.tenant_id))
  );

-- leads
create policy "leads_public_insert" on public.leads
  for insert with check (true);
create policy "leads_member_read" on public.leads
  for select using (public.is_tenant_member(tenant_id));

-- Anon precisa resolver host -> tenant: leitura pública de domínios de tenants ativos
create policy "tenant_domains_public_read" on public.tenant_domains
  for select using (
    exists (select 1 from public.tenants t where t.id = tenant_id and t.active = true)
  );
