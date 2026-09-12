-- =============================================================================
-- 0033 — Recursão infinita nas policies do portal + entitlement que não existia
--
-- DOIS PROBLEMAS, encontrados ao criar o primeiro caso de teste com dado dentro
-- (tenant `demo`). Nenhum dos dois aparece em banco vazio, que é exatamente o
-- motivo de terem passado pela 0028 e pela 0032.
--
-- -----------------------------------------------------------------------------
-- 1) ERRO 42P17 — infinite recursion detected in policy for relation
--
--    `contracts_read` consulta `contract_parties`.
--    `contract_parties_read` consulta `contracts`.
--    Cada uma dispara a RLS da outra, sem fundo.
--
--    Efeito prático: o cliente do portal não lê contrato, não lista documento e
--    não baixa arquivo — a policy de storage cai no mesmo ciclo, porque o
--    `exists` dela atravessa `portal_documents`. O portal inteiro devolve erro
--    de banco na primeira leitura real. Reproduzido e corrigido em schema
--    descartável antes de escrever esta migration: `42P17` com o desenho atual,
--    leitura normal com o desenho abaixo.
--
--    Remédio: o lado do cliente passa a ser resolvido por função
--    `security definer`. O dono da função é dono das tabelas, e dono de tabela
--    não reavalia RLS — o ciclo se rompe na primeira volta. É a saída que a
--    própria documentação do Postgres/Supabase indica para policies que
--    precisam enxergar outra tabela protegida.
--
-- -----------------------------------------------------------------------------
-- 2) O entitlement pago NÃO estava sendo aplicado no banco
--
--    A 0032 afirma, em comentário: "Esta função já gatilha todas as policies do
--    portal". Não gatilhava. Nenhuma policy chama `is_portal_user()` — todas
--    repetem o join em `portal_users` na mão, e esse join não conhece
--    `tenant_features`. Resultado: desligar o recurso fechava o acesso só na
--    camada de aplicação (`requirePortalUser`), e qualquer endpoint futuro que
--    esquecesse a checagem serviria dado de tenant suspenso.
--
--    Esta migration faz a afirmação virar verdade: todo caminho do cliente
--    passa a atravessar `is_portal_user()`, que carrega o termo de entitlement.
--    Suspender agora fecha NO BANCO, como estava projetado.
--
-- O caminho da imobiliária (`is_tenant_member`) não muda em nenhum ponto. O
-- painel não depende de nada aqui — regra que vale desde a 0032: entitlement
-- do portal nunca corta o painel de quem paga a mensalidade.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Resolvedor do vínculo do cliente
--
-- Devolve os contratos em que o usuário autenticado é parte, com o papel. É o
-- único lugar que lê `contract_parties` sem RLS — e ele é seguro porque a
-- cláusula está presa a `auth.uid()`: não existe argumento para apontar a
-- função para outra pessoa. Quem chama só consegue perguntar por si mesmo.
--
-- ⚠️ NÃO revogue EXECUTE (mesmo motivo documentado na 0028): expressão de
-- policy roda com a permissão de quem consulta, e sem EXECUTE toda policy que
-- chama a função falha com `permission denied for function`.
--
-- Esta função vai aparecer nos advisors 0028/0029 como RPC exposta, junto com
-- is_tenant_member e is_portal_user. A diferença que importa: aquelas devolvem
-- BOOLEANO sobre quem pergunta, esta devolve LINHAS. Por isso o argumento
-- "vazamento nulo" da 0028 não se herda de graça — foi conferido separado, em
-- produção, depois de aplicar:
--
--   anon chamando /rest/v1/rpc/portal_my_parties ............. 0 linhas
--   anon chamando portal_can_read_doc_path(caminho válido) ... false
--   membro de outra imobiliária chamando a RPC ............... 0 linhas
--
-- O motivo é estrutural, não coincidência: a cláusula é `pu.user_id =
-- auth.uid()`, e a função não tem parâmetro de identidade. Sem sessão,
-- auth.uid() é nulo e o join não casa com nada. Quem chama só consegue
-- perguntar por si mesmo, e a resposta é a mesma que o portal já lhe mostra.
-- -----------------------------------------------------------------------------
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
    -- Aqui entra o entitlement: is_portal_user() carrega o termo de
    -- tenant_features. Tenant sem plano some da resposta, e com ele somem o
    -- contrato, o documento e o arquivo, em todos os caminhos de uma vez.
    and public.is_portal_user(pu.tenant_id);
$$;

comment on function public.portal_my_parties() is
  'Contratos do cliente autenticado, com papel. Security definer para romper a '
  'recursão entre as policies de contracts e contract_parties. Preso a auth.uid().';

-- -----------------------------------------------------------------------------
-- Autorização de leitura de um arquivo do bucket privado
--
-- Existe separada porque a policy de storage não pode consultar
-- `portal_documents` direto: a RLS daquela tabela reentra na mesma cadeia.
-- Aqui a travessia acontece uma vez só, sem RLS, e o resultado é um booleano.
-- -----------------------------------------------------------------------------
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
  'O cliente autenticado pode ler este objeto do bucket portal-docs? '
  'Exige documento publicado e papel dentro de audience.';

-- -----------------------------------------------------------------------------
-- contracts — o ramo do cliente deixa de consultar contract_parties
-- -----------------------------------------------------------------------------
drop policy if exists "contracts_read" on public.contracts;
create policy "contracts_read" on public.contracts
  for select to authenticated
  using (
    is_tenant_member(tenant_id)
    or exists (
      select 1 from public.portal_my_parties() p
      where p.contract_id = contracts.id
        -- O par (contrato, tenant) é conferido junto de propósito: o vínculo
        -- vale dentro de UMA imobiliária. Sem isso, id de contrato vazado
        -- atravessaria tenant.
        and p.tenant_id = contracts.tenant_id
    )
  );

-- -----------------------------------------------------------------------------
-- contract_parties — mantém "só a própria linha", agora com entitlement
--
-- O cliente continua enxergando apenas o próprio vínculo, não os demais: o
-- inquilino não descobre o nome do proprietário por aqui. O que muda é o termo
-- de is_portal_user(), e o ramo do membro segue idêntico.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- portal_documents — mesma regra de audience, sem travessia de RLS
-- -----------------------------------------------------------------------------
drop policy if exists "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated
  using (
    is_tenant_member(tenant_id)
    or (
      -- Rascunho (published_at nulo) não existe para o cliente. A imobiliária
      -- prepara o boleto do mês antes de soltar.
      published_at is not null
      and exists (
        select 1 from public.portal_my_parties() p
        where p.contract_id = portal_documents.contract_id
          and p.tenant_id = portal_documents.tenant_id
          and p.party_role = any (portal_documents.audience)
      )
    )
  );

-- -----------------------------------------------------------------------------
-- storage.objects — o mesmo ciclo, pela porta do arquivo
-- -----------------------------------------------------------------------------
drop policy if exists "portal client reads own documents" on storage.objects;
create policy "portal client reads own documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portal-docs'
    -- Ler o objeto, nunca listar o bucket: sem isto o cliente enxergaria os
    -- nomes dos arquivos dos outros pela listagem, mesmo sem baixar.
    and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
    and public.portal_can_read_doc_path(name)
  );
