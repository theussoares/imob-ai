-- Feed para os portais (ZAP, Viva Real, OLX) que o Canal Pro aceita.
--
-- O sintoma: o painel e a landing vendiam "integração com portais", o cliente
-- colava o link no Canal Pro e NENHUM imóvel subia. O feed nunca mandou
-- `PostalCode` nem `Address`, que o VRSync exige em todo anúncio — o Grupo OLX
-- recusava a carga inteira, anúncio por anúncio. O imóvel simplesmente não tinha
-- onde guardar CEP e rua: o único campo era `location`, texto livre ("rua tal,
-- perto do mercado"), que não dá para mandar como CEP.
--
-- Duas peças:
--
-- 1. Endereço estruturado do imóvel (CEP, rua, número), INTERNO. É o mesmo
--    dado sensível que `location`: diz onde mora o inquilino atual ou onde fica
--    a casa vazia. O site público não mostra; o portal recebe e mostra só o
--    bairro (`displayAddress="Neighborhood"` no feed). Colunas novas não herdam
--    privilégio de coluna: `anon` e `authenticated` só leem as colunas listadas
--    nas 0011/0031, então estas nascem fechadas sem grant nenhum aqui. Quem lê
--    é o servidor, pela service role.
--
-- 2. `portal_feeds`: um token secreto por imobiliária, que entra no caminho da
--    URL do feed. Com endereço dentro, o feed não pode mais ficar num endereço
--    adivinhável (`/feed/imoveis.xml` em qualquer domínio de cliente): seria a
--    lista de endereços de todos os imóveis anunciados, aberta a quem pedir.
--    Tabela separada, e não coluna em `tenants`, porque `tenants` é lida pelo
--    anon com grant por coluna (0047) e um descuido no grant publicaria o
--    token. Aqui não há policy nenhuma: só a service role lê e grava.

alter table public.properties
  add column if not exists address_zip text,
  add column if not exists address_street text,
  add column if not exists address_number text;

-- CEP só com os 8 dígitos. O Canal Pro recusa CEP com máscara em parte dos
-- casos, e aceitar os dois formatos no banco é aceitar comparação que falha.
do $$ begin
  alter table public.properties
    add constraint properties_address_zip_formato check (address_zip is null or address_zip ~ '^[0-9]{8}$');
exception when duplicate_object then null; end $$;

comment on column public.properties.address_zip is
  'CEP (8 dígitos). INTERNO: vai só para o feed dos portais, que mostram o bairro. Ver 0058.';
comment on column public.properties.address_street is
  'Logradouro. INTERNO, como location. Ver 0058.';
comment on column public.properties.address_number is
  'Número. INTERNO, como location. Ver 0058.';

create table if not exists public.portal_feeds (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  token text not null unique check (length(token) >= 32),
  created_at timestamptz not null default now()
);

alter table public.portal_feeds enable row level security;

-- Sem policy de propósito, e o revoke porque a RLS sem policy só barra LINHA
-- depois do GRANT default que o Supabase dá a anon/authenticated.
revoke all on public.portal_feeds from anon, authenticated;

comment on table public.portal_feeds is
  'Token secreto da URL do feed dos portais, um por imobiliária. Só service role. Ver 0058.';
