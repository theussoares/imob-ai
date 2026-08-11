# imob-ai — Plataforma imobiliária multitenant

Site para corretores/imobiliárias: catálogo de imóveis com busca, página de detalhe
otimizada para SEO (Google + IA), contato via WhatsApp/lead e um **painel administrativo**
para gerenciar imóveis e configurar a marca. **Multitenant** — uma mesma implantação
atende vários clientes, resolvidos pelo domínio. O primeiro tenant é a **Imóveis Três Lagoas**.

## Stack

- **Nuxt 4** (SSR) + **Nitro** (fullstack; preset **Vercel**)
- **Tailwind CSS v4** + design tokens por tenant (CSS vars)
- **Supabase** (Postgres + Auth + Storage), acesso via `@supabase/supabase-js`
- **Supabase Auth** carregado sob demanda apenas no painel `/admin` (SPA), mantendo
  o client do Supabase fora do bundle das páginas públicas
- TypeScript, `@vueuse/nuxt`

## Arquitetura

```
app/            # Frontend SSR (páginas públicas + painel /admin)
  components/    # UI pública + components/admin
  composables/   # useTenant, useCatalog (filtro em memória), useContact, useFavorites
  pages/         # index, imovel/[code], admin/*
server/
  models/  →  (em shared/models) modelos de domínio camelCase
  mappers/       # row do banco  <->  modelo de domínio (snake_case <-> camelCase)
  repositories/  # acesso a dados, SEMPRE escopado por tenant_id
  api/           # endpoints públicos (cache 10min) + admin (protegidos)
  middleware/    # resolve o tenant pelo Host
  utils/         # supabase (anon), auth (requireTenantMember), cache, tenant
shared/          # modelos e tipos compartilhados client/servidor
supabase/migrations/  # schema, RLS, storage, seed
```

### Padrão models + mappers
Repositories retornam **modelos de domínio** (`shared/models/*`), nunca linhas cruas do banco.
Os **mappers** (`server/mappers/*`) convertem `snake_case` do Postgres para o `camelCase` do
domínio e vice-versa, isolando o schema da UI.

### Multitenancy
O catálogo é a **home (`/`)** e cada tenant é um **domínio** — não há prefixo de rota.
`server/middleware/tenant.ts` resolve o tenant por requisição, nesta ordem:

1. **Domínio próprio** cadastrado em `tenant_domains` (ex.: `imoveis3lagoas.com.br`).
2. **Subdomínio da plataforma**: `<slug>.<NUXT_PLATFORM_DOMAIN>` (ex.:
   `vitrine-imoveis.suaplataforma.com.br`) resolve pelo `slug` do tenant. Sem
   `NUXT_PLATFORM_DOMAIN`, o 1º rótulo de um host com subdomínio é usado como slug.
3. **Fallback** `NUXT_DEFAULT_TENANT` (dev / domínio não cadastrado).

O resultado vai para `event.context.tenant`; toda query é escopada por `tenant_id`.
As cores da marca (`brand_primary` / `brand_accent`) são injetadas como CSS vars no SSR —
trocar de tenant muda o tema sem rebuild. A resolução é cacheada 10 min em memória.

**Atalho de desenvolvimento:** em `pnpm dev`, `http://localhost:3000/?tenant=<slug>` troca o
tenant e grava um cookie (`?tenant=` vazio limpa). Desativado em produção.

### Cache (poucas requisições)
- **Servidor:** `/api/tenant` e `/api/properties*` são cacheados por **10 min** (TTL) com chave
  por tenant. Após expirar, a próxima requisição refaz a chamada e atualiza. O painel **invalida**
  o cache do tenant ao salvar.
- **Cliente:** a lista completa de imóveis ativos é carregada uma vez; busca, filtros e ordenação
  rodam **em memória** (`useCatalog`) — nenhuma requisição extra ao interagir.

### SEO (Google + IA)
SSR nativo, `useSeoMeta` dinâmico, **JSON-LD** (`RealEstateAgent` na home; `Product`+`Offer` e
`BreadcrumbList` no detalhe), `sitemap.xml` e `robots.txt` dinâmicos por host, canonical por
domínio, headings semânticos e imagens com `alt`.

## Configuração

1. **Variáveis de ambiente** — copie `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
   As chaves já apontam para o projeto Supabase provisionado (`SUPABASE_URL`, `SUPABASE_KEY` são
   públicas/anon — seguras no client).

2. **Instalar e rodar:**
   ```bash
   pnpm install
   pnpm dev            # http://localhost:3000  (site)  |  /admin  (painel)
   ```

## Banco de dados (Supabase)

O projeto Supabase `imob-ai` já está provisionado com o schema, RLS, buckets de storage e o
seed do tenant Três Lagoas (12 imóveis). As migrations estão em `supabase/migrations/` e podem
ser reaplicadas em um novo projeto com a Supabase CLI (`supabase db push`) ou pelo SQL Editor.

### Usuário administrador (criar/rotacionar)
O usuário admin **não** é versionado. Para criar um (ajuste e-mail/senha), rode no SQL Editor:

```sql
do $$
declare uid uuid := gen_random_uuid(); tid uuid;
begin
  select id into tid from public.tenants where slug = 'tres-lagoas';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'admin@imoveis3lagoas.com.br', extensions.crypt('TROQUE_ESTA_SENHA', extensions.gen_salt('bf')),
    now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    json_build_object('sub', uid::text, 'email', 'admin@imoveis3lagoas.com.br'),
    'email', now(), now(), now());
  insert into public.tenant_members (tenant_id, user_id, role) values (tid, uid, 'owner');
end $$;
```

> **Credenciais de demonstração já criadas:** `admin@imoveis3lagoas.com.br` / `Imoveis@2026`
> — **troque a senha** em produção (Supabase → Authentication → Users).

## Painel administrativo (`/admin`)

- **Login** com Supabase Auth (email/senha).
- **Dashboard** com contadores do catálogo.
- **Imóveis**: CRUD completo, status, destaque, diferenciais e **upload/ordenação de imagens**
  (Supabase Storage), com definição de capa.
- **Configurações**: nome, tagline, **cores da marca** (com preview ao vivo), logo, textos do hero
  e contatos (WhatsApp, telefone, e-mail, CRECI, cidade/UF). Tudo reflete no site público.

O acesso é escopado ao tenant do domínio (um admin só enxerga/edita os dados da própria
imobiliária), garantido por `requireTenantMember` no servidor + RLS no banco.

## Agent-readiness (descoberta por IA / agentes)

Além do SEO tradicional, o site expõe metadados para agentes de IA:

- **Link headers (RFC 8288)** na home e nas páginas de imóvel, apontando para o
  `api-catalog` e o `sitemap.xml` (`server/middleware/agents.ts`).
- **Markdown for Agents**: requisições com `Accept: text/markdown` em `/` e
  `/imovel/[code]` recebem uma versão em Markdown (HTML segue padrão para navegadores).
- **API catalog (RFC 9727)** em `/.well-known/api-catalog` (`application/linkset+json`)
  descrevendo os endpoints públicos.
- **Content Signals** no `robots.txt`: `search=yes, ai-input=yes, ai-train=no`.
- **WebMCP** (progressive enhancement): expõe a ferramenta `buscar_imoveis` a agentes
  no navegador via `navigator.modelContext`, quando suportado (`app/plugins/webmcp.client.ts`).

Não implementados por não se aplicarem a este site (catálogo público, sem APIs
protegidas por OAuth e sem servidor MCP próprio) ou por exigirem domínio/DNS ainda não
adquiridos: **DNS-AID** (precisa de domínio + DNSSEC), **OAuth/OIDC discovery**,
**OAuth Protected Resource**, **auth.md** e **MCP Server Card**. Podem ser adicionados
quando houver domínio próprio e/ou APIs autenticadas para agentes.

## Deploy (Vercel)

O Nitro já usa o preset `vercel`. Configure as variáveis `SUPABASE_URL`, `SUPABASE_KEY`,
`NUXT_PUBLIC_SITE_URL` (e opcionalmente `NUXT_DEFAULT_TENANT`) no projeto da Vercel e faça o
deploy. Para cada novo tenant/cliente, cadastre o domínio na Vercel e adicione a linha
correspondente em `tenant_domains`.

## Adicionar um novo tenant

```sql
insert into public.tenants (slug, name, whatsapp, email, city, state, brand_primary, brand_accent)
values ('novo-cliente', 'Imobiliária X', '55...', 'contato@x.com', 'Cidade', 'UF', '#123456', '#abcdef');
insert into public.tenant_domains (tenant_id, domain, is_primary)
values ((select id from tenants where slug='novo-cliente'), 'www.imobiliariax.com.br', true);
```
Depois crie um usuário admin (SQL acima) vinculado a esse tenant.
