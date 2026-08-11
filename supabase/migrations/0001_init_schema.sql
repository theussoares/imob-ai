-- ========== Enums ==========
create type property_type as enum ('casa', 'apartamento', 'sobrado', 'terreno');
create type property_purpose as enum ('venda', 'aluguel');
create type property_status as enum ('active', 'sold', 'rented', 'draft');
create type member_role as enum ('owner', 'admin');

-- ========== updated_at trigger ==========
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ========== tenants ==========
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text,
  hero_title text,
  hero_subtitle text,
  whatsapp text,
  phone text,
  email text,
  creci text,
  city text,
  state text,
  brand_primary text not null default '#0f3d38',
  brand_accent text not null default '#c2410c',
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tenants_updated before update on public.tenants
  for each row execute function public.set_updated_at();

-- ========== tenant_domains ==========
create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_tenant_domains_domain on public.tenant_domains(domain);

-- ========== tenant_members ==========
create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'admin',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index idx_tenant_members_user on public.tenant_members(user_id);
create index idx_tenant_members_tenant on public.tenant_members(tenant_id);

-- ========== properties ==========
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  title text not null,
  type property_type not null,
  purpose property_purpose not null,
  price numeric(12,2) not null default 0,
  neighborhood text,
  city text,
  state text,
  bedrooms int not null default 0,
  bathrooms int not null default 0,
  parking int not null default 0,
  area numeric(10,2) not null default 0,
  high_standard boolean not null default false,
  description text,
  features text[] not null default '{}',
  status property_status not null default 'active',
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index idx_properties_tenant_status on public.properties(tenant_id, status);
create index idx_properties_tenant_purpose on public.properties(tenant_id, purpose);
create trigger trg_properties_updated before update on public.properties
  for each row execute function public.set_updated_at();

-- ========== property_images ==========
create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null,
  alt text,
  position int not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_property_images_property on public.property_images(property_id, position);

-- ========== leads ==========
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  name text,
  phone text,
  message text,
  source text not null default 'form',
  created_at timestamptz not null default now()
);
create index idx_leads_tenant on public.leads(tenant_id, created_at desc);
