-- Área do Cliente — fundação: quem é o cliente, o que ele assinou e o que ele
-- pode baixar.
--
-- Contexto: até aqui o único usuário autenticado do sistema era a imobiliária
-- (`tenant_members`). Esta migration cria um SEGUNDO tipo de usuário — o
-- inquilino e o proprietário — que loga no mesmo Supabase Auth e NÃO pode
-- enxergar nada do painel.
--
-- A separação é a decisão central deste arquivo. `is_tenant_member()` hoje
-- libera 20 policies (imóveis com dados do proprietário, corretores, leads,
-- configurações). Dar ao cliente uma linha em `tenant_members` — ainda que com
-- um papel novo — entregaria a base inteira do concorrente… quer dizer, da
-- imobiliária, para qualquer inquilino. Por isso: tabela própria, predicado
-- próprio, e nenhum caminho entre os dois.
--
-- Tudo idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- 'fiador' entra desde já porque ele assina o contrato e costuma pedir a via
-- dele; sem o papel, a imobiliária cadastraria o fiador como inquilino e ele
-- passaria a ver o boleto do outro.
do $$ begin
  create type contract_party_role as enum ('inquilino', 'proprietario', 'fiador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_status as enum ('ativo', 'encerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal_doc_category as enum (
    'contrato', 'vistoria', 'boleto', 'recibo', 'extrato', 'outro'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- portal_users — o cliente da imobiliária (inquilino / proprietário / fiador)
-- ---------------------------------------------------------------------------
create table if not exists public.portal_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  -- CPF/CNPJ é como a imobiliária identifica a pessoa no contrato em papel.
  -- Fica aqui para conferência no cadastro, e nunca é devolvido ao portal.
  doc text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- Duas contas com o mesmo e-mail na mesma imobiliária seriam duas caixas de
-- entrada disputando o mesmo contrato — o suporte não teria como saber qual é a
-- boa. O índice é sobre lower(email) porque e-mail não diferencia maiúscula.
create unique index if not exists idx_portal_users_tenant_email
  on public.portal_users(tenant_id, lower(email));
create index if not exists idx_portal_users_user on public.portal_users(user_id);

drop trigger if exists trg_portal_users_updated on public.portal_users;
create trigger trg_portal_users_updated before update on public.portal_users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contracts — o contrato de locação
-- ---------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  -- O imóvel pode sair do catálogo (vendido, arquivado) sem que o contrato
  -- deixe de existir: o histórico de quem morou lá continua valendo.
  property_id uuid references public.properties(id) on delete set null,
  -- Preenchido quando o imóvel não está no catálogo (locação administrada de
  -- imóvel que nunca foi anunciado por nós).
  address_label text,
  status contract_status not null default 'ativo',
  started_on date,
  ends_on date,
  rent_amount numeric(12,2),
  -- Os três campos abaixo não são usados por nenhuma tela da área do cliente.
  -- Entram agora porque são o vocabulário mínimo da cobrança, e porque contrato
  -- em produção é dado que alguém digitou: acrescentar coluna depois significa
  -- pedir à imobiliária que reabra 10, 50 ou 300 contratos para preencher o que
  -- faltou. Três colunas hoje, ou uma migration com trabalho manual do cliente
  -- depois.
  --
  -- Dia do vencimento: o que decide quando a cobrança é emitida e com quanta
  -- antecedência ela vai para o inquilino.
  due_day smallint,
  -- Índice do reajuste anual (igpm, ipca, incc...). Texto livre e não enum: a
  -- lista real varia por contrato e um enum aqui vira migration a cada exceção.
  adjustment_index text,
  -- 'manual' hoje (a imobiliária sobe os arquivos pelo painel). Quando a
  -- integração com o ERP entrar, o mesmo contrato passa a chegar com
  -- source='erp', sem migrar tabela nem reescrever a área do cliente.
  source text not null default 'manual',
  -- ⚠️ Campos internos da imobiliária (anotação, taxa de administração, id no
  -- ERP) NÃO moram aqui — ver `contract_internal`, logo abaixo.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

alter table public.contracts
  drop constraint if exists contracts_source_check;
alter table public.contracts
  add constraint contracts_source_check check (source in ('manual', 'erp'));

-- Dia 31 em fevereiro é problema de quem agenda, não do banco — mas dia 0 e dia
-- 45 são erro de digitação, e um contrato com vencimento inválido só aparece no
-- mês em que a cobrança não sai.
alter table public.contracts
  drop constraint if exists contracts_due_day_check;
alter table public.contracts
  add constraint contracts_due_day_check check (due_day is null or (due_day between 1 and 31));



create index if not exists idx_contracts_tenant_status on public.contracts(tenant_id, status);
create index if not exists idx_contracts_property on public.contracts(property_id);

drop trigger if exists trg_contracts_updated on public.contracts;
create trigger trg_contracts_updated before update on public.contracts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contract_internal — o que é da imobiliária e nunca do cliente
--
-- Tabela separada em vez de colunas com privilégio diferente dentro de
-- `contracts`. Duas razões, ambas da documentação do Supabase:
--
--   1. Ela desaconselha privilégio por coluna e recomenda, textualmente, "RLS
--      combinada com uma tabela dedicada" no lugar.
--   2. Papel com privilégio restrito NÃO pode usar `select('*')` na tabela: o
--      PostgREST expande o curinga para todas as colunas e a query inteira
--      falha com "permission denied". Este repositório já pagou esse preço uma
--      vez — está comentado em `property.repository.ts`, e é por isso que as
--      leituras públicas de imóvel listam coluna por coluna.
--
-- Com a tabela separada, a RLS faz o trabalho sozinha e `select('*')` volta a
-- ser seguro em `contracts`. O modelo também fica mais honesto: "o que o cliente
-- vê" e "o que é da imobiliária" viram tabelas diferentes, não colunas com
-- permissão diferente.
-- ---------------------------------------------------------------------------
create table if not exists public.contract_internal (
  contract_id uuid primary key references public.contracts(id) on delete cascade,
  -- Anotação da imobiliária sobre o contrato.
  notes text,
  -- Percentual retido pela imobiliária. É margem comercial: o proprietário tem
  -- direito ao número, mas ele chega até ele pelo extrato de repasse, que é
  -- documento endereçado — não por consulta à tabela.
  admin_fee_percent numeric(5,2),
  -- Id do contrato no ERP, quando a integração existir.
  external_id text,
  updated_at timestamptz not null default now()
);

alter table public.contract_internal
  drop constraint if exists contract_internal_admin_fee_check;
alter table public.contract_internal
  add constraint contract_internal_admin_fee_check
  check (admin_fee_percent is null or (admin_fee_percent >= 0 and admin_fee_percent <= 100));

drop trigger if exists trg_contract_internal_updated on public.contract_internal;
create trigger trg_contract_internal_updated before update on public.contract_internal
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contract_parties — quem está em qual contrato, e em que papel
--
-- É esta tabela que responde "esta pessoa pode ver este documento?". O papel
-- fica na RELAÇÃO, não na pessoa: quem aluga um imóvel e é dono de outro é
-- inquilino num contrato e proprietário no outro, com a mesma conta.
-- ---------------------------------------------------------------------------
create table if not exists public.contract_parties (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  portal_user_id uuid not null references public.portal_users(id) on delete cascade,
  role contract_party_role not null,
  created_at timestamptz not null default now(),
  unique (contract_id, portal_user_id, role)
);
create index if not exists idx_contract_parties_user on public.contract_parties(portal_user_id);
create index if not exists idx_contract_parties_contract on public.contract_parties(contract_id);

-- ---------------------------------------------------------------------------
-- portal_documents — o arquivo que a imobiliária publica para o cliente
-- ---------------------------------------------------------------------------
create table if not exists public.portal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  category portal_doc_category not null,
  title text not null,
  -- Mês de referência (boleto/extrato). Guardado como data no dia 1 para
  -- ordenar e agrupar sem parsear texto.
  competence date,
  due_on date,
  amount numeric(12,2),
  -- Caminho no bucket PRIVADO `portal-docs`. Nunca é URL: a URL é assinada na
  -- hora do download, depois da checagem de permissão no servidor.
  storage_path text not null,
  mime text,
  size_bytes bigint,
  -- Quem enxerga. O boleto do inquilino não é assunto do proprietário, e o
  -- extrato de repasse do proprietário não é assunto do inquilino — os dois
  -- vazamentos são o mesmo campo esquecido no default.
  audience contract_party_role[] not null default '{inquilino,proprietario}',
  -- Rascunho enquanto null: o arquivo já está no bucket, mas some do portal.
  -- Sem isso, um upload no meio do expediente aparece pela metade para o
  -- cliente (a imobiliária sobe 12 boletos, o cliente vê 3).
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_documents_contract
  on public.portal_documents(contract_id, category, competence desc);
create index if not exists idx_portal_documents_tenant on public.portal_documents(tenant_id);

-- ---------------------------------------------------------------------------
-- portal_document_access — trilha de download (LGPD)
--
-- Documento de locação é dado pessoal, e boleto é dado financeiro. Quando
-- alguém perguntar "quem baixou meu contrato?", a resposta precisa existir —
-- e ela não pode ser reconstruída depois do fato.
-- ---------------------------------------------------------------------------
create table if not exists public.portal_document_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.portal_documents(id) on delete cascade,
  portal_user_id uuid references public.portal_users(id) on delete set null,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_doc_access_doc
  on public.portal_document_access(document_id, created_at desc);
create index if not exists idx_portal_doc_access_tenant
  on public.portal_document_access(tenant_id, created_at desc);
-- FK sem índice de cobertura é o advisor 0001, que já lista 7 casos em produção.
create index if not exists idx_portal_doc_access_user
  on public.portal_document_access(portal_user_id);

-- ---------------------------------------------------------------------------
-- Predicado do cliente — o espelho de is_tenant_member(), e o oposto dele
-- ---------------------------------------------------------------------------
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

-- `active` desliga o acesso sem apagar o histórico: contrato encerrado tira a
-- pessoa do portal, mas a trilha de quem baixou o quê continua de pé.

-- ⚠️ NÃO revogue EXECUTE desta função.
--
-- A versão anterior desta migration trazia
-- `revoke execute on function public.is_portal_user(uuid) from anon, authenticated`,
-- seguindo os advisors 0028/0029, que apontam funções `security definer`
-- expostas como RPC em /rest/v1/rpc/.
--
-- Isso derrubaria o portal inteiro. Expressão de policy roda com a permissão de
-- quem consulta, e o privilégio de EXECUTE É verificado: sem ele, toda policy
-- que chama a função falha com `permission denied for function`. Testado em
-- schema isolado neste banco, com função e tabela descartáveis — o resultado foi
-- exatamente esse erro.
--
-- O remédio correto para o advisor é a outra saída que ele mesmo lista: tirar a
-- função do schema exposto (mover para um schema `private`, que o PostgREST não
-- publica), mantendo EXECUTE para as policies. Isso exige reescrever todas as
-- policies que referenciam as funções e está registrado como dívida, não feito
-- aqui — ver `0029_reconciliar_producao.sql`.
--
-- Na prática o vazamento é nulo: a função responde "VOCÊ é cliente deste
-- tenant?", que é coisa que o próprio chamador já sabe.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.portal_users           enable row level security;
alter table public.contract_internal     enable row level security;
alter table public.contracts              enable row level security;
alter table public.contract_parties       enable row level security;
alter table public.portal_documents       enable row level security;
alter table public.portal_document_access enable row level security;

-- Três regras valem para TODAS as policies abaixo, e as três vêm dos advisors:
--
--   1. `to authenticated` — a policy nem é avaliada para o papel `anon`
--      (advisor 0003 e a orientação de "specify roles in your policies").
--   2. `(select auth.uid())` em vez de `auth.uid()` solto — dentro de um
--      subselect a função roda uma vez por QUERY; solta, uma vez por LINHA.
--      A documentação é explícita: não há desvantagem em aplicar isso sempre.
--   3. UMA policy permissiva por ação, com `or` — duas policies permissivas
--      sobre a mesma ação rodam as duas em toda query (advisor 0006, que já
--      acusa 30 ocorrências neste banco). Por isso "membro OU parte do
--      contrato" é uma expressão só, não duas policies.

-- portal_users --------------------------------------------------------------
drop policy if exists "portal_users_member_all" on public.portal_users;
drop policy if exists "portal_users_self_read" on public.portal_users;

-- Leitura: a imobiliária vê os clientes dela; o cliente vê a PRÓPRIA linha.
-- Sem o `user_id = auth.uid()` do segundo termo, um inquilino listaria nome,
-- telefone e CPF de todos os clientes da imobiliária.
create policy "portal_users_read" on public.portal_users
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or user_id = (select auth.uid())
  );

-- Escrita: só a imobiliária. O cliente não edita o próprio cadastro pelo portal.
create policy "portal_users_member_write" on public.portal_users
  for all to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- contracts -----------------------------------------------------------------
drop policy if exists "contracts_member_all" on public.contracts;
drop policy if exists "contracts_party_read" on public.contracts;

create policy "contracts_read" on public.contracts
  for select to authenticated using (
    public.is_tenant_member(tenant_id)
    or id in (
      -- Sem join com a tabela de origem: a documentação de performance de RLS
      -- recomenda trazer o conjunto e usar `in`, em vez de correlacionar.
      select cp.contract_id
      from public.contract_parties cp
      join public.portal_users pu on pu.id = cp.portal_user_id
      where pu.user_id = (select auth.uid())
        and pu.active
        -- A pessoa e o contrato têm que ser da MESMA imobiliária. Sem isto, um
        -- id de contrato vazado atravessaria tenants.
        and pu.tenant_id = contracts.tenant_id
    )
  );

create policy "contracts_member_write" on public.contracts
  for all to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- contract_internal ---------------------------------------------------------
-- Só a imobiliária, em qualquer operação. Não existe termo de cliente aqui, e a
-- ausência é a proteção: sem policy que o alcance, o cliente não lê a linha.
drop policy if exists "contract_internal_member_all" on public.contract_internal;
create policy "contract_internal_member_all" on public.contract_internal
  for all to authenticated
  using (
    contract_id in (select c.id from public.contracts c where public.is_tenant_member(c.tenant_id))
  )
  with check (
    contract_id in (select c.id from public.contracts c where public.is_tenant_member(c.tenant_id))
  );

-- contract_parties ----------------------------------------------------------
drop policy if exists "contract_parties_member_all" on public.contract_parties;
drop policy if exists "contract_parties_self_read" on public.contract_parties;

-- O cliente enxerga apenas o PRÓPRIO vínculo. Deliberadamente não enxerga os
-- outros participantes: o inquilino não precisa do contato do proprietário para
-- baixar um documento, e vice-versa. Se um dia precisar, é decisão de produto —
-- não efeito colateral de policy.
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

create policy "contract_parties_member_write" on public.contract_parties
  for all to authenticated
  using (
    contract_id in (select c.id from public.contracts c where public.is_tenant_member(c.tenant_id))
  )
  with check (
    contract_id in (select c.id from public.contracts c where public.is_tenant_member(c.tenant_id))
  );

-- portal_documents ----------------------------------------------------------
drop policy if exists "portal_documents_member_all" on public.portal_documents;
drop policy if exists "portal_documents_party_read" on public.portal_documents;

-- A regra inteira da área do cliente cabe no segundo termo: publicado, de um
-- contrato em que a pessoa é parte, e endereçado ao papel dela NAQUELE contrato.
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

create policy "portal_documents_member_write" on public.portal_documents
  for all to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- portal_document_access ----------------------------------------------------
-- Trilha é só de leitura, e só para a imobiliária. A escrita acontece pelo
-- servidor (service role) no momento do download: se o próprio cliente pudesse
-- inserir, poderia forjar linhas e o registro deixaria de valer como prova.
drop policy if exists "portal_doc_access_member_read" on public.portal_document_access;
create policy "portal_doc_access_member_read" on public.portal_document_access
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Privilégios de tabela
--
-- A anon key vai no HTML de toda página do site. Policy sozinha não basta: sem
-- o revoke, o papel anon mantém o GRANT default do Supabase sobre as tabelas
-- novas. Nenhuma destas tabelas tem qualquer leitura pública — contrato, boleto
-- e vistoria não são catálogo.
-- ---------------------------------------------------------------------------
revoke all on public.portal_users           from anon;
revoke all on public.contract_internal     from anon;
revoke all on public.contracts              from anon;
revoke all on public.contract_parties       from anon;
revoke all on public.portal_documents       from anon;
revoke all on public.portal_document_access from anon;

-- Nenhum `revoke` por coluna em `contracts`: o que é interno mora em
-- `contract_internal`, protegida por RLS. É o que permite `select('*')` seguir
-- funcionando aqui — ver a nota na criação daquela tabela.

-- ---------------------------------------------------------------------------
-- Storage: bucket PRIVADO
--
-- Os três buckets existentes são públicos (foto de imóvel, logo, hero) — nesses,
-- URL vazada é no máximo uma foto de anúncio. Aqui é contrato assinado e boleto:
-- o bucket nasce privado e o cliente nunca fala com o storage direto. O download
-- passa pelo servidor, que confere a permissão e devolve uma URL assinada de
-- vida curta.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('portal-docs', 'portal-docs', false)
on conflict (id) do nothing;

-- Só a imobiliária escreve, e só dentro da própria pasta (mesmo esquema de
-- 0012: o primeiro nível do path é o slug do tenant).
drop policy if exists "member upload portal-docs" on storage.objects;
create policy "member upload portal-docs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portal-docs' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "member update portal-docs" on storage.objects;
create policy "member update portal-docs" on storage.objects
  for update to authenticated
  using (bucket_id = 'portal-docs' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "member delete portal-docs" on storage.objects;
create policy "member delete portal-docs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portal-docs' and public.is_member_of_slug((storage.foldername(name))[1]));

drop policy if exists "member read portal-docs" on storage.objects;
create policy "member read portal-docs" on storage.objects
  for select to authenticated
  using (bucket_id = 'portal-docs' and public.is_member_of_slug((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------
-- E a policy do CLIENTE — a segunda barreira do download
--
-- O desenho original deixava o cliente sem policy nenhuma e confiava só no
-- código: o servidor checava a permissão e assinava a URL com service role.
-- O problema é que service role IGNORA RLS — então, se alguém esquecesse a
-- checagem antes de assinar, não havia nada embaixo.
--
-- Com esta policy existe uma segunda barreira, no banco. Para que ela de fato
-- rode, a assinatura tem que ser feita com o token DO CLIENTE (o client que
-- `requirePortalUser` devolve), não com service role. A service role fica só
-- para gravar a trilha de acesso.
--
-- A condição é a mesma regra de sempre, agora em SQL: publicado, de um contrato
-- em que a pessoa é parte, e endereçado ao papel dela naquele contrato.
--
-- ⚠️ `allow_any_operation` é o que impede que dar leitura para baixar vire
-- permissão de LISTAR o bucket — sem ele, um cliente enumeraria os caminhos dos
-- documentos de todos os contratos de todos os tenants. A lista abaixo é a
-- documentada para leitura de objeto; se a operação usada pela assinatura tiver
-- outro nome nesta versão do Storage, o download para de funcionar de forma
-- VISÍVEL (falha fechada, que é o modo certo de errar aqui) e o nome correto
-- entra nesta lista. Conferir no primeiro apply.
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

-- O join acima percorre storage.objects.name -> portal_documents.storage_path.
-- Sem índice nessa coluna, cada download vira varredura da tabela de documentos.
create index if not exists idx_portal_documents_storage_path
  on public.portal_documents(storage_path);
