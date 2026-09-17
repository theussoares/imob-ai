-- Isolamento entre clientes da Área do Cliente — contra as POLICIES REAIS.
--
-- Card 3.1. Complementa `test/server/portal-isolation.test.ts`, que roda no CI
-- contra o fake do Supabase e cobre as regras em TypeScript.
--
-- ⚠️ Por que existe uma versão em SQL, se já há uma em vitest.
--
-- O teste de código prova o que o código faz. Ele não prova o que o BANCO faz —
-- e é o banco que isola. Em 16/09 uma migration escrita contra a pasta do
-- repositório ia recriar as policies do portal no formato antigo,
-- reintroduzindo uma recursão infinita (42P17) que derruba o portal inteiro. A
-- suíte de vitest teria passado verde: ela lê a pasta, não o banco.
--
-- Este arquivo roda contra o banco de verdade, personificando clientes reais
-- com `set local role authenticated` + `request.jwt.claims`.
--
-- COMO RODAR: cole no SQL Editor do Supabase, ou pelo MCP. É LEITURA, exceto o
-- bloco do entitlement, que desliga e RELIGA o recurso dentro do mesmo `do $$`
-- — sendo um só comando, se algo falhar no meio o Postgres desfaz tudo e o
-- recurso continua ligado.
--
-- Substitua os dois uuids abaixo pelos clientes do ambiente onde for rodar:
--   select pu.user_id, t.slug, pu.name, cp.role
--     from portal_users pu
--     join tenants t on t.id = pu.tenant_id
--     join contract_parties cp on cp.portal_user_id = pu.id;
--
-- Precisa de um INQUILINO e um PROPRIETÁRIO no MESMO contrato — é entre esses
-- dois que mora o vazamento que mata o produto.

create temp table if not exists iso(caso text, esperado text, obtido text, ok boolean);
truncate iso;

do $$
declare
  -- ⚠️ TROCAR pelos uuids do ambiente.
  inquilino    uuid := '5b477722-50a4-4d62-beeb-5c69d6ebb68b';
  proprietario uuid := '1168b4b6-5736-46e3-bbd1-d82658fa8357';
  slug_tenant  text := 'demo';

  t_id uuid;
  n int;
  b boolean;
  doc_inquilino text;
  doc_proprietario text;
begin
  select id into t_id from public.tenants where slug = slug_tenant;

  select storage_path into doc_inquilino from public.portal_documents
   where category = 'recibo' and published_at is not null limit 1;
  select storage_path into doc_proprietario from public.portal_documents
   where category = 'extrato' and published_at is not null limit 1;

  -- =========================================================================
  -- 1. Audiência: o vazamento que mata o produto
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', inquilino, 'role','authenticated')::text, true);

  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents where category = 'extrato';
  execute 'reset role';
  insert into iso values ('inquilino NAO ve extrato de repasse', '0', n::text, n = 0);

  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents where category = 'recibo' and published_at is not null;
  execute 'reset role';
  insert into iso values ('inquilino VE o proprio recibo', '>0', n::text, n > 0);

  perform set_config('request.jwt.claims', json_build_object('sub', proprietario, 'role','authenticated')::text, true);

  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents where category = 'recibo';
  execute 'reset role';
  insert into iso values ('proprietario NAO ve recibo do inquilino', '0', n::text, n = 0);

  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents where category = 'extrato' and published_at is not null;
  execute 'reset role';
  insert into iso values ('proprietario VE o proprio extrato', '>0', n::text, n > 0);

  -- =========================================================================
  -- 2. Rascunho e dados de outro cliente
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', inquilino, 'role','authenticated')::text, true);

  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents where published_at is null;
  execute 'reset role';
  insert into iso values ('rascunho invisivel', '0', n::text, n = 0);

  execute 'set local role authenticated';
  select count(*) into n from public.portal_users;
  execute 'reset role';
  insert into iso values ('cliente ve SO a propria linha de cadastro', '1', n::text, n = 1);

  -- =========================================================================
  -- 3. O download assinado — o caminho que NÃO passa por RLS de tabela
  -- =========================================================================
  execute 'set local role authenticated';
  select public.portal_can_read_doc_path(doc_inquilino) into b;
  execute 'reset role';
  insert into iso values ('inquilino assina o proprio documento', 'true', b::text, b);

  execute 'set local role authenticated';
  select public.portal_can_read_doc_path(doc_proprietario) into b;
  execute 'reset role';
  insert into iso values ('inquilino NAO assina o documento do dono', 'false', b::text, not b);

  execute 'set local role authenticated';
  select public.portal_can_read_doc_path('outra-imobiliaria/x/qualquer.pdf') into b;
  execute 'reset role';
  insert into iso values ('caminho de outra imobiliaria nao assina', 'false', b::text, not b);

  -- =========================================================================
  -- 4. Cross-tenant
  -- =========================================================================
  execute 'set local role authenticated';
  select count(*) into n from public.portal_my_parties() p where p.tenant_id <> t_id;
  execute 'reset role';
  insert into iso values ('nenhum vinculo fora do proprio tenant', '0', n::text, n = 0);

  execute 'set local role authenticated';
  select count(*) into n from public.contracts c where c.tenant_id <> t_id;
  execute 'reset role';
  insert into iso values ('nenhum contrato de outro tenant', '0', n::text, n = 0);

  -- =========================================================================
  -- 5. Anônimo
  -- =========================================================================
  perform set_config('request.jwt.claims', NULL, true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.portal_documents;
  exception when others then
    n := -1;  -- permission denied também é isolamento
  end;
  execute 'reset role';
  insert into iso values ('anonimo nao alcanca documento algum', '0 ou erro', n::text, n <= 0);

  -- =========================================================================
  -- 6. Entitlement — desliga e RELIGA no mesmo bloco
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', inquilino, 'role','authenticated')::text, true);

  update public.tenant_features set enabled = false, grace_until = null
   where tenant_id = t_id and feature = 'portal';

  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents;
  execute 'reset role';
  insert into iso values ('recurso desligado fecha os documentos', '0', n::text, n = 0);

  execute 'set local role authenticated';
  select count(*) into n from public.contracts;
  execute 'reset role';
  insert into iso values ('recurso desligado fecha os contratos', '0', n::text, n = 0);

  update public.tenant_features set grace_until = current_date + 5
   where tenant_id = t_id and feature = 'portal';
  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents where published_at is not null;
  execute 'reset role';
  insert into iso values ('carencia no futuro mantem o acesso', '>0', n::text, n > 0);

  update public.tenant_features set grace_until = current_date - 1
   where tenant_id = t_id and feature = 'portal';
  execute 'set local role authenticated';
  select count(*) into n from public.portal_documents;
  execute 'reset role';
  insert into iso values ('carencia vencida fecha o acesso', '0', n::text, n = 0);

  -- RESTAURA. Confira o resultado disto depois de rodar.
  update public.tenant_features set enabled = true, grace_until = null
   where tenant_id = t_id and feature = 'portal';
end $$;

select caso, esperado, obtido, case when ok then 'OK' else '*** FALHOU ***' end as veredito from iso;

-- Confirme que o recurso voltou ao que era:
select t.slug, f.enabled, f.grace_until from public.tenant_features f
  join public.tenants t on t.id = f.tenant_id order by t.slug;
