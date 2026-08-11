import type { H3Event } from 'h3'
import type { Tenant } from '~~/shared/models/tenant'
import { getTenantByDomain, getTenantBySlug } from '~~/server/repositories/tenant.repository'

declare module 'h3' {
  interface H3EventContext {
    tenant?: Tenant | null
  }
}

const TTL_MS = 10 * 60 * 1000
const cacheByHost = new Map<string, { tenant: Tenant | null; expiresAt: number }>()

export function getHostname(event: H3Event): string {
  const host = getRequestHost(event, { xForwardedHost: true }) || 'localhost'
  return (host.split(':')[0] || 'localhost').toLowerCase()
}

/** Resolve o tenant a partir do hostname (cacheado em memória por 10 min). */
export async function resolveTenantForHost(hostname: string): Promise<Tenant | null> {
  const now = Date.now()
  const hit = cacheByHost.get(hostname)
  if (hit && hit.expiresAt > now) return hit.tenant

  const client = publicSupabase()
  let tenant = await getTenantByDomain(client, hostname)
  if (!tenant) {
    const fallback = useRuntimeConfig().defaultTenant || 'tres-lagoas'
    tenant = await getTenantBySlug(client, fallback)
  }
  cacheByHost.set(hostname, { tenant, expiresAt: now + TTL_MS })
  return tenant
}

export function clearTenantHostCache(): void {
  cacheByHost.clear()
}

/** Lê o tenant já resolvido pelo middleware; 404 se não houver. */
export function useTenantContext(event: H3Event): Tenant {
  const tenant = event.context.tenant
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Imobiliária não encontrada para este domínio.' })
  }
  return tenant
}
