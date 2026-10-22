# Moradi: Multi-tenant Real Estate Platform

A website platform for real estate agents and agencies: searchable property catalog, SEO-optimized listing pages (Google + AI), WhatsApp/lead contact, and an **admin panel** to manage listings and configure branding. **Multi-tenant**: a single deployment serves many clients, resolved by domain. The first tenant is **Imóveis Três Lagoas**.

## Stack

- **Nuxt 4** (SSR) + **Nitro** (fullstack, **Vercel** preset)
- **Tailwind CSS v4** + per-tenant design tokens (CSS vars)
- **Supabase** (Postgres + Auth + Storage) via `@supabase/supabase-js`
- **Supabase Auth** loaded on demand only in the `/admin` SPA, keeping the Supabase client out of the public pages' bundle
- TypeScript, `@vueuse/nuxt`

## Architecture

```
app/            # SSR frontend (public pages + /admin panel)
  components/    # public UI + components/admin
  composables/   # useTenant, useCatalog (in-memory filtering), useContact, useFavorites
  pages/         # index, [slug]/[code], admin/*
server/
  mappers/       # DB row <-> domain model (snake_case <-> camelCase)
  repositories/  # data access, ALWAYS scoped by tenant_id
  api/           # public endpoints (10-min cache) + protected admin endpoints
  middleware/    # resolves the tenant from the Host header
  utils/         # supabase (anon), auth (requireTenantMember), cache, tenant
shared/          # domain models and types shared by client and server
supabase/migrations/  # schema, RLS, storage, seed
```

### Models + mappers pattern
Repositories return **domain models** (`shared/models/*`), never raw database rows. **Mappers** (`server/mappers/*`) convert Postgres `snake_case` to domain `camelCase` and back, isolating the database schema from the UI.

### Multi-tenancy
The catalog is the **home page (`/`)** and each tenant is a **domain**, with no route prefix. `server/middleware/tenant.ts` resolves the tenant per request, in this order:

1. **Custom domain** registered in `tenant_domains` (e.g. `imoveis3lagoas.com.br`).
2. **Platform subdomain**: `<slug>.<NUXT_PLATFORM_DOMAIN>` resolves by the tenant `slug`. Without `NUXT_PLATFORM_DOMAIN`, the first label of a subdomain host is used as the slug.
3. **Fallback** `NUXT_DEFAULT_TENANT` (dev / unregistered domain).

The result is stored in `event.context.tenant` and every query is scoped by `tenant_id`. Brand colors (`brand_primary` / `brand_accent`) are injected as CSS vars during SSR, so switching tenants changes the theme without a rebuild. Resolution is cached in memory for 10 minutes.

**Dev shortcut:** with `pnpm dev`, `http://localhost:3000/?tenant=<slug>` switches the tenant and stores a cookie (an empty `?tenant=` clears it). Disabled in production.

### Caching (fewer requests)
- **Server:** `/api/tenant` and `/api/properties*` are cached for **10 min** (TTL), keyed per tenant. The admin panel **invalidates** the tenant cache on save.
- **Client:** the full list of active properties is loaded once; search, filters, and sorting run **in memory** (`useCatalog`), so interacting triggers no extra requests.

### SEO (Google + AI)
Native SSR, dynamic `useSeoMeta`, **JSON-LD** (`RealEstateAgent` on home; `Product` + `Offer` and `BreadcrumbList` on listing pages), dynamic per-host `sitemap.xml` and `robots.txt`, per-domain canonical URLs, semantic headings, and images with `alt` text.

## Setup

1. **Environment variables**: copy `.env.example` to `.env` and fill it in:
   ```bash
   cp .env.example .env
   ```
   `SUPABASE_URL` and `SUPABASE_KEY` are public/anon keys, safe on the client. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS, stays server-side only, and is required: without it the contact form stops saving leads. `.env.example` documents what breaks when each variable is left blank.

2. **Install and run:**
   ```bash
   pnpm install
   pnpm dev            # http://localhost:3000 (site)  |  /admin (panel)
   ```

## Database (Supabase)

Migrations live in `supabase/migrations/` (schema, RLS, storage buckets, and a seed tenant with sample listings). Apply them to a new project with the Supabase CLI (`supabase db push`) or the SQL Editor.

### Admin user (create / rotate)
Admin users are **not** versioned. To create one (adjust email/password), run in the SQL Editor:

```sql
do $$
declare uid uuid := gen_random_uuid(); tid uuid;
begin
  select id into tid from public.tenants where slug = 'tres-lagoas';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'admin@example.com', extensions.crypt('CHANGE_THIS_PASSWORD', extensions.gen_salt('bf')),
    now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    json_build_object('sub', uid::text, 'email', 'admin@example.com'),
    'email', now(), now(), now());
  insert into public.tenant_members (tenant_id, user_id, role) values (tid, uid, 'owner');
end $$;
```

## Admin panel (`/admin`)

- **Login** with Supabase Auth (email/password).
- **Dashboard** with catalog counters.
- **Properties**: full CRUD, status, featured flag, highlights, and **image upload/ordering** (Supabase Storage) with cover selection.
- **Settings**: name, tagline, **brand colors** (live preview), logo, hero texts, and contacts (WhatsApp, phone, email, license number, city/state). Everything is reflected on the public site.

Access is scoped to the tenant of the current domain (an admin can only see and edit their own agency's data), enforced by `requireTenantMember` on the server plus RLS in the database.

## Agent-readiness (AI discovery)

Beyond traditional SEO, the site exposes metadata for AI agents:

- **Link headers (RFC 8288)** on home and listing pages, pointing to the `api-catalog` and `sitemap.xml`.
- **Markdown for Agents**: requests with `Accept: text/markdown` on `/` and `/{slug}/{code}` receive a Markdown version (HTML remains the default for browsers).
- **API catalog (RFC 9727)** at `/.well-known/api-catalog` (`application/linkset+json`) describing the public endpoints.
- **Content Signals** in `robots.txt`: `search=yes, ai-input=yes, ai-train=no`.
- **`/llms.txt`** (llmstxt.org): per-tenant Markdown index of the site and its listings for LLMs.
- **WebMCP** (progressive enhancement): exposes a `search_properties` tool to in-browser agents via `navigator.modelContext`, when supported.

## Deploy (Vercel)

Nitro already uses the `vercel` preset. Set `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (required), plus `RATE_LIMIT_IP_SALT`: without it, the per-IP throttle on the public form does not run and the only signal is a log warning. Optional: `NUXT_DEFAULT_TENANT` and `NUXT_PLATFORM_DOMAIN`. For each new tenant, add the domain in Vercel and insert the matching row in `tenant_domains`.

## Adding a new tenant

```sql
insert into public.tenants (slug, name, whatsapp, email, city, state, brand_primary, brand_accent)
values ('new-client', 'Agency X', '55...', 'contact@x.com', 'City', 'ST', '#123456', '#abcdef');
insert into public.tenant_domains (tenant_id, domain, is_primary)
values ((select id from tenants where slug='new-client'), 'www.agencyx.com', true);
```
Then create an admin user (SQL above) linked to that tenant.
