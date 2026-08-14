import type { H3Event } from 'h3'
import type { Tenant } from '~~/shared/models/tenant'
import { getTenantByDomain, getTenantBySlug } from '~~/server/repositories/tenant.repository'

declare module 'h3' {
  interface H3EventContext {
    tenant?: Tenant | null
    platformRoot?: boolean
  }
}

/** O host é o domínio-raiz da plataforma (ex.: usemoradi.com.br), sem subdomínio de tenant? */
export function isPlatformRootHost(hostname: string): boolean {
  const platform = (useRuntimeConfig().platformDomain || '').toLowerCase()
  if (!platform) return false
  return hostname === platform || hostname === 'www.' + platform
}

// Cache curto: mudanças de branding/config no painel refletem no site em ~1 min.
// (Em serverless a invalidação só alcança uma instância, então o TTL é o que garante.)
const TTL_MS = 60 * 1000
const cache = new Map<string, { tenant: Tenant | null; expiresAt: number }>()

function getCached(key: string): Tenant | null | undefined {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.tenant
  return undefined
}
function setCached(key: string, tenant: Tenant | null) {
  cache.set(key, { tenant, expiresAt: Date.now() + TTL_MS })
}

export function getHostname(event: H3Event): string {
  const host = getRequestHost(event, { xForwardedHost: true }) || 'localhost'
  return (host.split(':')[0] || 'localhost').toLowerCase()
}

/**
 * Deriva um slug de tenant a partir do subdomínio, quando aplicável:
 * - Se NUXT_PLATFORM_DOMAIN estiver definido: `<slug>.<platform>` -> slug
 * - `<slug>.localhost` (dev) -> slug
 * - Genérico (sem platform configurado): primeiro rótulo de um host com
 *   subdomínio (>= 3 partes) que não seja "www"
 */
function subdomainSlug(hostname: string): string | null {
  const platform = (useRuntimeConfig().platformDomain || '').toLowerCase()
  const parts = hostname.split('.')

  if (platform && hostname.endsWith('.' + platform)) {
    const label = hostname.slice(0, hostname.length - platform.length - 1).split('.')[0]
    return label || null
  }
  if (hostname.endsWith('.localhost')) {
    return parts[0] || null
  }
  if (!platform && parts.length >= 3 && parts[0] && parts[0] !== 'www') {
    return parts[0]
  }
  return null
}

/** Resolve o tenant a partir do hostname (domínio próprio OU subdomínio da plataforma). */
export async function resolveTenantForHost(hostname: string): Promise<Tenant | null> {
  const cached = getCached('host:' + hostname)
  if (cached !== undefined) return cached

  const client = publicSupabase()

  // 1) Domínio próprio cadastrado em tenant_domains
  let tenant = await getTenantByDomain(client, hostname)

  // 2) Subdomínio da plataforma (slug)
  if (!tenant) {
    const slug = subdomainSlug(hostname)
    if (slug) tenant = await getTenantBySlug(client, slug)
  }

  // 3) Fallback (dev / domínio não cadastrado)
  if (!tenant) {
    const fallback = useRuntimeConfig().defaultTenant || 'tres-lagoas'
    tenant = await getTenantBySlug(client, fallback)
  }

  setCached('host:' + hostname, tenant)
  return tenant
}

/** Resolve diretamente por slug (usado pelo atalho de dev ?tenant=slug). */
export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  const cached = getCached('slug:' + slug)
  if (cached !== undefined) return cached
  const tenant = await getTenantBySlug(publicSupabase(), slug)
  setCached('slug:' + slug, tenant)
  return tenant
}

export function clearTenantHostCache(): void {
  cache.clear()
}

/** Lê o tenant já resolvido pelo middleware; 404 se não houver. */
export function useTenantContext(event: H3Event): Tenant {
  const tenant = event.context.tenant
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Imobiliária não encontrada para este domínio.' })
  }
  return tenant
}
