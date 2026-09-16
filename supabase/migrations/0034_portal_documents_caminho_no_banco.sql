-- O caminho do arquivo passa a ser verificado NO BANCO.
--
-- Achado na revisão de segurança da Fase 1. `assertCaminhoDoTenant`
-- (portal-document.repository.ts) exige que `storage_path` comece com o slug do
-- tenant — e está documentada lá como "a guarda mais importante deste arquivo".
-- Só que ela vive no endpoint Nitro, e o endpoint não é o único caminho até a
-- tabela.
--
-- A 0028 revoga privilégios de `portal_documents` apenas de `anon`. O papel
-- `authenticated` mantém o GRANT default do Supabase, e a policy de escrita é:
--
--   with check (public.is_tenant_member(tenant_id))
--
-- Ou seja: valida SÓ o tenant. Não valida `storage_path`, nem que
-- `contract_id` seja daquele tenant. Um membro do painel, com a anon key que já
-- vai no HTML e o próprio token, insere direto pelo PostgREST:
--
--   insert into portal_documents (tenant_id, contract_id, storage_path, ...)
--   values (<o tenant dele>, <contrato dele>, 'slug-da-vizinha/…/arquivo.pdf', …)
--
-- Tudo legítimo, menos o caminho. E a policy do bucket criada na 0028 casa
-- `d.storage_path = storage.objects.name` e confere papel e contrato — mas
-- nunca confere que a PASTA do objeto é do tenant do documento. Resultado: a
-- URL é assinada e o cliente baixa o arquivo da outra imobiliária.
--
-- As duas barreiras que o download anuncia viram uma só, e essa uma é
-- contornável exatamente pelo papel que ela deveria conter.
--
-- Esta migration fecha os dois lados:
--   1. trigger em `portal_documents` — o caminho e o contrato passam a ser
--      verificados em toda escrita, venha de onde vier;
--   2. a policy do bucket passa a exigir que a primeira pasta do objeto seja o
--      slug do tenant do documento.
--
-- `assertCaminhoDoTenant` continua no repositório: ela devolve 403 legível em
-- vez de erro de banco. O que muda é que ela deixa de ser a fronteira.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. Trigger de validação
-- ---------------------------------------------------------------------------
create or replace function public.portal_documents_valida_caminho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slug_tenant text;
  tenant_do_contrato uuid;
begin
  select t.slug into slug_tenant from public.tenants t where t.id = new.tenant_id;
  if slug_tenant is null then
    raise exception 'Imobiliária inexistente para este documento.'
      using errcode = '23514';
  end if;

  -- O primeiro nível do path é sempre o slug do tenant — mesma convenção da
  -- 0012 e da 0028. `split_part` devolve '' quando não há barra, o que também
  -- cai aqui.
  if split_part(new.storage_path, '/', 1) <> slug_tenant then
    raise exception 'storage_path fora da pasta da imobiliária (esperado %/...)', slug_tenant
      using errcode = '23514';
  end if;

  -- `..` escaparia da pasta mesmo com o prefixo certo.
  if position('..' in new.storage_path) > 0 then
    raise exception 'storage_path não pode conter ".."'
      using errcode = '23514';
  end if;

  -- O contrato precisa ser do mesmo tenant. Sem isto, um id de contrato alheio
  -- anexaria o documento ao contrato de outra imobiliária — e as partes DELA
  -- passariam a enxergá-lo.
  select c.tenant_id into tenant_do_contrato from public.contracts c where c.id = new.contract_id;
  if tenant_do_contrato is null or tenant_do_contrato <> new.tenant_id then
    raise exception 'Contrato não pertence a esta imobiliária.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_portal_documents_caminho on public.portal_documents;
create trigger trg_portal_documents_caminho
  before insert or update of storage_path, tenant_id, contract_id
  on public.portal_documents
  for each row execute function public.portal_documents_valida_caminho();

-- ---------------------------------------------------------------------------
-- 2. A policy do bucket confere a pasta, não só o nome do objeto
-- ---------------------------------------------------------------------------
-- A versão da 0028 casava `d.storage_path = storage.objects.name` e conferia
-- publicação, contrato, papel e tenant DO CLIENTE — mas aceitava qualquer nome
-- de objeto que estivesse gravado na linha. Com o trigger acima o caminho já
-- nasce correto; esta condição é a segunda barreira, para o caso de uma linha
-- antiga ou de uma escrita que contorne o trigger.
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
        -- A pasta do objeto é do tenant DONO do documento. É o que impede uma
        -- linha apontar para o arquivo de outra imobiliária.
        and (storage.foldername(storage.objects.name))[1] = t.slug
        and d.published_at is not null
        and pu.user_id = (select auth.uid())
        and pu.active
        and pu.tenant_id = d.tenant_id
        and cp.role = any (d.audience)
    )
  );
