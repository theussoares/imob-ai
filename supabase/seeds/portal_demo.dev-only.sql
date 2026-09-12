-- ⚠️  APENAS DEMONSTRAÇÃO — NÃO É MIGRATION. Não rode em tenant de cliente real.
--
-- Caso fictício da Área do Cliente, no tenant `demo` (Aurora Imóveis): duas
-- pessoas (inquilina e proprietário), um contrato e cinco documentos cobrindo
-- as três regras que importam — audiência por papel, rascunho invisível e
-- separação entre tenants.
--
-- A trava no início existe porque este repositório já teve massa fictícia
-- aplicada no tenant `olmi` por engano (cliente real, imóveis inventados no site
-- público, desfeito pela migration 0010). Aqui o script se recusa a rodar em
-- qualquer slug que não seja `demo`.
--
-- E-mails em `.invalid`: TLD reservado pela RFC 2606, garantidamente não
-- entregável. Dado de teste não pode ter chance de mandar e-mail para ninguém.
--
-- Senha das duas contas: AuroraDemo#2026
--
-- ---------------------------------------------------------------------------
-- Os ARQUIVOS não estão aqui. Depois de rodar, suba os cinco PDFs no bucket
-- privado `portal-docs`, em `demo/<contract_id>/`, com estes nomes:
--   contrato.pdf  vistoria.pdf  recibo-2026-09.pdf
--   extrato-2026-09.pdf  recibo-2026-10.pdf
-- Sem eles as telas listam normalmente e o download devolve 404 do storage.
--
-- Para desfazer tudo, ver o bloco de limpeza no fim do arquivo.
-- ---------------------------------------------------------------------------

do $$
declare
  tid uuid;
  uid_inq uuid := gen_random_uuid();
  uid_prop uuid := gen_random_uuid();
  pu_inq uuid;
  pu_prop uuid;
  cid uuid;
begin
  select id into tid from public.tenants where slug = 'demo';
  if tid is null then
    raise exception 'Tenant `demo` não existe neste banco. Este seed é só para ele.';
  end if;

  -- ---- contas de Auth (mesmo padrão que o README documenta para o admin) ----
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values
    ('00000000-0000-0000-0000-000000000000', uid_inq, 'authenticated', 'authenticated',
     'inquilino@exemplo.invalid', extensions.crypt('AuroraDemo#2026', extensions.gen_salt('bf')),
     now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_prop, 'authenticated', 'authenticated',
     'proprietario@exemplo.invalid', extensions.crypt('AuroraDemo#2026', extensions.gen_salt('bf')),
     now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), uid_inq, uid_inq::text,
     json_build_object('sub', uid_inq::text, 'email', 'inquilino@exemplo.invalid'),
     'email', now(), now(), now()),
    (gen_random_uuid(), uid_prop, uid_prop::text,
     json_build_object('sub', uid_prop::text, 'email', 'proprietario@exemplo.invalid'),
     'email', now(), now(), now());

  -- ---- clientes do portal ----
  insert into public.portal_users (tenant_id, user_id, name, email, doc, phone)
  values (tid, uid_inq, 'Joana Ribeiro', 'inquilino@exemplo.invalid', '111.111.111-11', '5567999990001')
  returning id into pu_inq;

  insert into public.portal_users (tenant_id, user_id, name, email, doc, phone)
  values (tid, uid_prop, 'Carlos Menezes', 'proprietario@exemplo.invalid', '222.222.222-22', '5567999990002')
  returning id into pu_prop;

  -- ---- contrato ----
  insert into public.contracts
    (tenant_id, code, address_label, status, started_on, ends_on, rent_amount, due_day, adjustment_index)
  values
    (tid, 'AUR-001', 'Rua das Acácias, 250 — Centro', 'ativo',
     '2026-03-01', '2028-02-29', 2400.00, 10, 'igpm')
  returning id into cid;

  insert into public.contract_internal (contract_id, notes, admin_fee_percent)
  values (cid, 'Contrato de demonstração. Nenhum dado real.', 10.00);

  insert into public.contract_parties (contract_id, portal_user_id, role) values
    (cid, pu_inq, 'inquilino'),
    (cid, pu_prop, 'proprietario');

  -- ---- documentos ----
  -- As audiências são o ponto do teste: contrato e vistoria vão para os dois,
  -- recibo só para a inquilina, extrato de repasse só para o proprietário. O
  -- último não tem published_at — não pode aparecer para ninguém.
  insert into public.portal_documents
    (tenant_id, contract_id, category, title, competence, due_on, amount,
     storage_path, mime, audience, published_at)
  values
    (tid, cid, 'contrato', 'Contrato de locação assinado', null, null, null,
     'demo/' || cid || '/contrato.pdf', 'application/pdf',
     '{inquilino,proprietario,fiador}', now()),
    (tid, cid, 'vistoria', 'Vistoria de entrada', null, null, null,
     'demo/' || cid || '/vistoria.pdf', 'application/pdf',
     '{inquilino,proprietario,fiador}', now()),
    (tid, cid, 'recibo', 'Recibo de aluguel — setembro/2026', '2026-09-01', '2026-09-10', 2400.00,
     'demo/' || cid || '/recibo-2026-09.pdf', 'application/pdf',
     '{inquilino}', now()),
    (tid, cid, 'extrato', 'Extrato de repasse — setembro/2026', '2026-09-01', null, 2160.00,
     'demo/' || cid || '/extrato-2026-09.pdf', 'application/pdf',
     '{proprietario}', now()),
    (tid, cid, 'recibo', 'Recibo de aluguel — outubro/2026 (RASCUNHO)', '2026-10-01', '2026-10-10', 2400.00,
     'demo/' || cid || '/recibo-2026-10.pdf', 'application/pdf',
     '{inquilino}', null);

  raise notice 'Contrato de demonstração: %', cid;
end $$;

-- ---------------------------------------------------------------------------
-- Limpeza (rode para desfazer; a ordem respeita as FKs)
-- ---------------------------------------------------------------------------
-- delete from public.portal_documents d
--   using public.contracts c, public.tenants t
--   where d.contract_id = c.id and c.tenant_id = t.id and t.slug = 'demo' and c.code = 'AUR-001';
-- delete from public.contract_parties cp
--   using public.contracts c, public.tenants t
--   where cp.contract_id = c.id and c.tenant_id = t.id and t.slug = 'demo' and c.code = 'AUR-001';
-- delete from public.contract_internal ci
--   using public.contracts c, public.tenants t
--   where ci.contract_id = c.id and c.tenant_id = t.id and t.slug = 'demo' and c.code = 'AUR-001';
-- delete from public.contracts c using public.tenants t
--   where c.tenant_id = t.id and t.slug = 'demo' and c.code = 'AUR-001';
-- delete from public.portal_users
--   where email in ('inquilino@exemplo.invalid', 'proprietario@exemplo.invalid');
-- delete from auth.users
--   where email in ('inquilino@exemplo.invalid', 'proprietario@exemplo.invalid');
