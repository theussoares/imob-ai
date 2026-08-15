import type { H3Event } from 'h3'
import type { Tenant } from '~~/shared/models/tenant'
import { getTenantByDomain, getTenantBySlug } from '~~/server/repositories/tenant.repository'

declare module 'h3' {
  interface H3EventContext {
    tenant?: Tenant | null
    platformRoot?: boolean
    /** Host que não é tenant nem o domínio-raiz da plataforma (ex.: *.vercel.app). */
    unknownHost?: boolean
  }
}

/** O host é o domínio-raiz da plataforma (ex.: usemoradi.com.br), sem subdomínio de tenant? */
export function isPlatformRootHost(hostname: string): boolean {
  const platform = (useRuntimeConfig().platformDomain || '').toLowerCase()
  if (!platform) return false
  return hostname === platform || hostname === 'www.' + platform
}

/**
 * Convenção da plataforma: `painel.<dominio-do-cliente>` serve exclusivamente o
 * admin. É prefixo em vez de configuração por tenant justamente pra que todo
 * cliente novo ganhe o painel no próprio domínio sem cadastro extra.
 */
export const ADMIN_HOST_PREFIX = 'painel.'

export function isAdminHost(hostname: string): boolean {
  return hostname.startsWith(ADMIN_HOST_PREFIX)
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

  // 2) Mesmo domínio sem "www." — só o apex costuma estar cadastrado, e sem isto
  //    www.dominio.com.br não casa e acabaria servindo outro tenant pelo fallback.
  if (!tenant && hostname.startsWith('www.')) {
    tenant = await getTenantByDomain(client, hostname.slice(4))
  }

  // 3) `painel.<dominio>` resolve pelo domínio-base: assim o painel no domínio do
  //    cliente funciona só com o apex cadastrado, sem linha extra por tenant.
  if (!tenant && isAdminHost(hostname)) {
    tenant = await getTenantByDomain(client, hostname.slice(ADMIN_HOST_PREFIX.length))
  }

  // 4) Subdomínio da plataforma (slug)
  if (!tenant) {
    const slug = subdomainSlug(hostname)
    if (slug) tenant = await getTenantBySlug(client, slug)
  }

  // Sem fallback aqui de propósito: quem decide o que fazer com host não
  // resolvido é o middleware (redirect, landing ou — só em dev — tenant padrão).
  // Deixar o fallback dentro desta função fazia QUALQUER host resolver em dev,
  // mascarando esses caminhos e tornando-os impossíveis de testar localmente.
  setCached('host:' + hostname, tenant)
  return tenant
}

/**
 * Se `hostname` for um subdomínio de um domínio cadastrado de tenant, devolve
 * esse domínio-base; senão, null.
 *
 * Serve ao caso do wildcard na Vercel (*.dominio.com.br): com ele TODOS os
 * subdomínios do cliente passam a existir, e um host não reconhecido acabaria
 * exibindo a landing da plataforma dentro do domínio do próprio cliente. Aqui o
 * middleware detecta isso e manda a pessoa para o site dele.
 *
 * Usa getTenantByDomain (correspondência exata), não resolveTenantForHost: este
 * último tem fallback em dev e devolveria um tenant para qualquer host,
 * provocando redirect indevido.
 */
export async function findRegisteredBaseDomain(hostname: string): Promise<string | null> {
  const parts = hostname.split('.')
  if (parts.length < 3) return null // já é apex; não há rótulo a remover
  const base = parts.slice(1).join('.')

  const cacheKey = 'domain:' + base
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached ? base : null

  const tenant = await getTenantByDomain(publicSupabase(), base)
  setCached(cacheKey, tenant)
  return tenant ? base : null
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
