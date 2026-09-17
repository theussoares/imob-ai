-- O caminho do arquivo passa a ser verificado NO BANCO.
--
-- Achado na revisão de segurança da Fase 1. `assertCaminhoDoTenant`
-- (portal-document.repository.ts) exige que `storage_path` comece com o slug do
-- tenant. Mas ela vive no endpoint Nitro, e o endpoint não é o único caminho
-- até a tabela: a 0028 revoga privilégios de `portal_documents` apenas de
-- `anon`, e `authenticated` mantém o GRANT default. A policy de escrita valida
-- só `with check (is_tenant_member(tenant_id))` — não o caminho, não o contrato.
--
-- Um membro do painel insere a linha direto pelo PostgREST apontando para a
-- pasta de OUTRA imobiliária, e a leitura do bucket casa `storage_path` com o
-- nome do objeto sem nunca conferir a pasta. O download é assinado, e o cliente
-- baixa o arquivo alheio.
--
-- ⚠️ ESCRITA CONTRA O ESTADO REAL DA PRODUÇÃO, não contra a 0028.
-- A produção tem uma migration `corrigir_recursao_policies_portal` que não está
-- nesta pasta e que trocou as subqueries inline das policies do portal por
-- funções `security definer` (`portal_my_parties`, `portal_can_read_doc_path`).
-- Reescrever a policy do bucket como a 0028 a definia reintroduziria a recursão
-- que aquela migration existe para resolver. Por isso a checagem de pasta entra
-- DENTRO de `portal_can_read_doc_path`, preservando o desenho de lá.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. Trigger de validação na escrita
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
    raise exception 'Imobiliária inexistente para este documento.' using errcode = '23514';
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
    raise exception 'storage_path não pode conter ".."' using errcode = '23514';
  end if;

  -- O contrato precisa ser do mesmo tenant. Sem isto, um id de contrato alheio
  -- anexaria o documento ao contrato de outra imobiliária — e as partes DELA
  -- passariam a enxergá-lo.
  select c.tenant_id into tenant_do_contrato from public.contracts c where c.id = new.contract_id;
  if tenant_do_contrato is null or tenant_do_contrato <> new.tenant_id then
    raise exception 'Contrato não pertence a esta imobiliária.' using errcode = '23514';
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
-- 2. A leitura do bucket confere a PASTA, não só o nome do objeto
-- ---------------------------------------------------------------------------
-- Preserva o desenho da produção: a policy continua chamando esta função, e a
-- função continua usando `portal_my_parties()`. O que muda é uma linha — a que
-- amarra a pasta do objeto ao tenant dono do documento.
--
-- É a segunda barreira: com o trigger acima o caminho já nasce correto, mas uma
-- linha antiga (ou uma escrita que contorne o trigger) continuaria valendo sem
-- esta condição.
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
    join public.tenants t on t.id = d.tenant_id
    where d.storage_path = p_path
      and d.published_at is not null
      and p.party_role = any (d.audience)
      -- A pasta do objeto é do tenant DONO do documento.
      and (storage.foldername(p_path))[1] = t.slug
  );
$$;
