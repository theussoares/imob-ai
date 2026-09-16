-- Rollback da 0034.
--
-- ⚠️ Reabre o caminho descrito na 0034: um membro do painel volta a poder
-- registrar um documento apontando para o arquivo de outra imobiliária.
--
-- Volta `portal_can_read_doc_path` à forma que a produção tinha antes (sem a
-- checagem de pasta), preservando o uso de `portal_my_parties`.

drop trigger if exists trg_portal_documents_caminho on public.portal_documents;
drop function if exists public.portal_documents_valida_caminho();

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
