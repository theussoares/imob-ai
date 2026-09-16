-- A Área do Cliente vira recurso ligado por tenant (entitlement).
--
-- Decisão do plano, 11/09: a feature é vendida à parte, como plano superior na
-- mensalidade. O mecanismo é um recurso por tenant, e não uma coluna `plan` com
-- enum — os nomes dos planos ainda não existem porque nada foi vendido, e errar
-- o nome do tier custa migration.
--
-- ⚠️ O PLANO PARTIA DE UMA PREMISSA FALSA, e é por isso que esta migration é
-- maior do que ele previa. Estava escrito que a checagem deveria morar dentro de
-- `is_portal_user()`, "e como essa função gatilha todas as policies do portal, o
-- recurso desligado passa a fechar o acesso NO BANCO, em todo caminho".
--
-- `is_portal_user()` foi criada na 0028 e **nenhuma policy a usa**. As policies
-- do portal fazem a checagem inline (`pu.user_id = auth.uid() and pu.active`).
-- Mudar só a função não fecharia nada: ela não gatilha coisa alguma hoje.
--
-- Então o recurso entra nas POLICIES, uma a uma, no termo do cliente. A função
-- também é atualizada, para quem vier a usá-la no futuro não herdar a versão
-- sem entitlement.
--
-- Três regras do plano que esta migration respeita:
--   1. o painel da imobiliária NUNCA é cortado por isto — só o portal. Por isso
--      o conjunto novo entra apenas no termo do cliente, jamais no
--      `is_tenant_member(...)`. Cortar o painel É reter dado do cliente, e é a
--      conduta do precedente judicial citado no plano.
--   2. a suspensão não menciona pagamento (isso é texto de tela, em
--      `requirePortalUser`).
--   3. `portal_document_access` não é tocada: trilha de tratamento sobrevive ao
--      corte de acesso.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- A tabela
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_features (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Texto livre e não enum, pelo mesmo motivo de `adjustment_index`: recurso
  -- novo não pode custar migration de tipo.
  feature text not null,
  enabled boolean not null default false,
  -- Carência: o acesso continua até esta data mesmo com `enabled = false`.
  -- É o que expressa a régua de inadimplência do plano (aviso, D+7, suspensão
  -- em D+15) sem precisar de coluna de estado: desliga na hora, marca a data.
  grace_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature)
);

drop trigger if exists trg_tenant_features_updated on public.tenant_features;
create trigger trg_tenant_features_updated before update on public.tenant_features
  for each row execute function public.set_updated_at();

alter table public.tenant_features enable row level security;

-- Leitura para o membro do painel (a tela precisa saber o que está ligado).
-- Escrita NÃO: quem liga e desliga recurso pago é a plataforma, pela service
-- role. Uma imobiliária que pudesse dar `update` aqui se autoconcederia o
-- plano superior.
drop policy if exists "tenant_features_member_read" on public.tenant_features;
create policy "tenant_features_member_read" on public.tenant_features
  for select to authenticated using (public.is_tenant_member(tenant_id));

revoke all on public.tenant_features from anon;

-- ---------------------------------------------------------------------------
-- O predicado
-- ---------------------------------------------------------------------------
create or replace function public.tenant_feature_ativa(t_id uuid, f text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_features tf
    where tf.tenant_id = t_id
      and tf.feature = f
      and (tf.enabled or (tf.grace_until is not null and tf.grace_until > now()))
  );
$$;

-- ⚠️ NÃO revogue EXECUTE desta função, pelo mesmo motivo documentado na 0028
-- para `is_portal_user`: expressão de policy roda com a permissão de quem
-- consulta, e o privilégio de EXECUTE É verificado. Sem ele, toda policy que a
-- chama falha com `permission denied for function` — ou seja, o portal inteiro
-- cai. O remédio para o advisor é mover a função para um schema não exposto,
-- não revogar.

-- `is_portal_user` passa a considerar o recurso também. Hoje ela não é chamada
-- por policy nenhuma (ver a nota no topo); atualizar evita que o próximo uso
-- herde a versão sem entitlement.
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
  )
  and public.tenant_feature_ativa(t_id, 'portal');
$$;

-- ---------------------------------------------------------------------------
-- Semeadura ANTES de trocar as policies
-- ---------------------------------------------------------------------------
-- Sem isto, trocar as policies fecharia o portal para quem já usa: nenhuma
-- linha em `tenant_features` significa recurso desligado. Liga para todo tenant
-- que JÁ tem cliente cadastrado — quem está usando não pode ser cortado por uma
-- migration de infraestrutura.
--
-- Tenant novo não ganha nada: o recurso é pago, e o padrão é desligado.
insert into public.tenant_features (tenant_id, feature, enabled)
select distinct pu.tenant_id, 'portal', true
from public.portal_users pu
on conflict (tenant_id, feature) do nothing;

-- ---------------------------------------------------------------------------
-- As policies — o conjunto novo entra SÓ no termo do cliente
-- ---------------------------------------------------------------------------

drop policy if exists "portal_users_read" on public.portal_users;
create policy "portal_users_read" on public.portal_users
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or (
      user_id = (select auth.uid())
      and public.tenant_feature_ativa(tenant_id, 'portal')
    )
  );

drop policy if exists "contracts_read" on public.contracts;
create policy "contracts_read" on public.contracts
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or (
      public.tenant_feature_ativa(contracts.tenant_id, 'portal')
      and id in (
        select cp.contract_id
        from public.contract_parties cp
        join public.portal_users pu on pu.id = cp.portal_user_id
        where pu.user_id = (select auth.uid())
          and pu.active
          and pu.tenant_id = contracts.tenant_id
      )
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
      where pu.user_id = (select auth.uid())
        and pu.active
        -- O tenant vem da linha do cliente: `contract_parties` não tem coluna
        -- de tenant própria.
        and public.tenant_feature_ativa(pu.tenant_id, 'portal')
    )
  );

drop policy if exists "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or (
      published_at is not null
      and public.tenant_feature_ativa(portal_documents.tenant_id, 'portal')
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

-- O download assinado: o recurso desligado precisa fechar também o bucket,
-- senão uma URL já assinada continuaria valendo e o corte seria só de tela.
-- Mantém a checagem de pasta que a 0034 acrescentou.
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
        and public.tenant_feature_ativa(d.tenant_id, 'portal')
    )
  );
