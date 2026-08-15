-- Blindagem de schema e RLS. Corrige três lacunas em que o banco de produção foi
-- alterado à mão e as migrations ficaram para trás — ou seja, um ambiente novo
-- (staging, cliente novo, restore) subiria SEM as proteções que produção tem.
--
-- Tudo aqui é idempotente: seguro rodar em produção (onde parte já existe) e num
-- banco limpo.

-- ---------------------------------------------------------------------------
-- 1) brokers: tabela criada fora de migration e SEM RLS versionada.
--    Sem RLS, qualquer um com a anon key (que é pública, vai no HTML) lê nome,
--    telefone, e-mail e CRECI de TODOS os corretores de TODOS os tenants.
-- ---------------------------------------------------------------------------
create table if not exists public.brokers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  creci text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brokers enable row level security;

-- Corretor é dado INTERNO: nenhuma policy de leitura pública. Só membros do tenant.
drop policy if exists "brokers_member_read" on public.brokers;
create policy "brokers_member_read" on public.brokers
  for select using (public.is_tenant_member(tenant_id));

drop policy if exists "brokers_member_write" on public.brokers;
create policy "brokers_member_write" on public.brokers
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- Tira o privilégio de tabela do papel anon (a policy acima já barraria, mas sem
-- o revoke o anon continua com GRANT default do Supabase).
revoke all on public.brokers from anon;

-- ---------------------------------------------------------------------------
-- 2) Colunas internas de properties: existem em produção, mas não em migration.
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists location text,
  add column if not exists broker_id uuid references public.brokers(id) on delete set null,
  add column if not exists owner_name text,
  add column if not exists owner_phone text;

-- ---------------------------------------------------------------------------
-- 3) O REVOKE que É a proteção de privacidade nunca foi versionado — só o GRANT
--    (migration 0005). Num banco novo, o anon manteria o GRANT default sobre
--    properties e leria owner_name/owner_phone/location à vontade via REST.
--    O revoke + grant por coluna precisa vir NESTA ordem.
-- ---------------------------------------------------------------------------
revoke select on public.properties from anon;

grant select (
  id, tenant_id, code, title, type, purpose, price,
  neighborhood, city, state, bedrooms, bathrooms, parking, area,
  high_standard, description, features, status, featured,
  created_at, updated_at
) on public.properties to anon;
