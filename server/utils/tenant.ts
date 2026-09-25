import type { H3Event } from 'h3'
import type { Tenant } from '~~/shared/models/tenant'
import { getTenantByDomain, getTenantBySlug } from '~~/server/repositories/tenant.repository'
import { areaClienteAtiva, quemSomosAtiva } from '~~/server/utils/entitlement'

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

// A regra do host de painel mora em shared/: o navegador também precisa dela,
// para decidir se registra o service worker. Não reexporte daqui: shared/utils
// e server/utils são auto-importados, e o mesmo nome saindo dos dois faz o Nuxt
// avisar "Duplicated imports" e escolher uma das fontes por conta própria.
import { ADMIN_HOST_PREFIX, isAdminHost } from '~~/shared/utils/admin-host'

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
 *
 * `platform` entra por parâmetro em vez de sair do `useRuntimeConfig()` para
 * que esta regra — que é pura — possa ser testada sem subir o Nuxt, como o
 * resto da lógica de host.
 */
export function subdomainSlug(hostname: string, platform: string): string | null {
  platform = (platform || '').toLowerCase()
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

/**
 * O slug de tenant para um host, já descontando o prefixo do painel.
 *
 * O `painel.` sai antes de derivar o slug. Sem isso, o primeiro rótulo de
 * `painel.<slug>.<platform>` é "painel", a busca vira `getTenantBySlug('painel')`
 * — que não é tenant de ninguém — e o painel não resolve.
 *
 * Isso passou despercebido porque o passo 3 de `resolveTenantForHost` cobre o
 * caso quando o domínio-base está cadastrado em `tenant_domains`, e três dos
 * quatro tenants têm o subdomínio da plataforma cadastrado lá. `tres-lagoas`
 * não tem: para ele, `painel.tres-lagoas.usemoradi.com.br` chegava até aqui e
 * devolvia nulo. Depender daquele cadastro é frágil — ele é opcional e nada o
 * exige na criação de um tenant.
 */
export function tenantSlugForHost(hostname: string, platform: string): string | null {
  const base = isAdminHost(hostname) ? hostname.slice(ADMIN_HOST_PREFIX.length) : hostname
  return subdomainSlug(base, platform)
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

  /**
   * 4) Subdomínio da plataforma (slug).
   *
   * O `painel.` sai antes de derivar o slug. Sem isso, o primeiro rótulo de
   * `painel.<slug>.<platform>` é "painel" e a busca vira `getTenantBySlug('painel')`,
   * que não é tenant de ninguém — o painel simplesmente não resolvia.
   *
   * Isso passou despercebido porque o passo 3 cobre o caso quando o domínio-base
   * está cadastrado em `tenant_domains`, e três dos quatro tenants têm o
   * subdomínio da plataforma cadastrado lá. `tres-lagoas` não tem: para ele,
   * `painel.tres-lagoas.usemoradi.com.br` caía aqui e devolvia nulo. Depender
   * daquele cadastro é frágil — ele é opcional e nada o exige.
   */
  if (!tenant) {
    const slug = tenantSlugForHost(hostname, useRuntimeConfig().platformDomain || '')
    if (slug) tenant = await getTenantBySlug(client, slug)
  }

  // Sem fallback aqui de propósito: quem decide o que fazer com host não
  // resolvido é o middleware (redirect, landing ou — só em dev — tenant padrão).
  // Deixar o fallback dentro desta função fazia QUALQUER host resolver em dev,
  // mascarando esses caminhos e tornando-os impossíveis de testar localmente.
  tenant = await comLinksEfetivos(tenant)

  setCached('host:' + hostname, tenant)
  return tenant
}

/**
 * `portalEnabled` no payload é o valor EFETIVO: a imobiliária ligou **e** tem o
 * recurso valendo.
 *
 * ⚠️ Achado da revisão do PR #27, e o percurso é o desenho da suspensão, não um
 * caso de borda:
 *
 *   1. a imobiliária usa a Área do Cliente e liga o link — `portal_enabled` true;
 *   2. a carência vence e `tenant_features` fica inativo;
 *   3. `portal_enabled` continua true, porque as duas colunas são independentes;
 *   4. **o link segue no ar no site dela**, e quem clicar chega num login que
 *      recusa todo mundo, porque a RLS já fechou o portal.
 *
 * Esconder o interruptor do painel não resolvia isso: impede LIGAR, não impede
 * continuar ligado — e ainda tirava o único jeito de desligar sem SQL.
 *
 * Colapsar aqui, e não acrescentar um campo novo ao payload, é decisão de
 * privacidade: o valor efetivo é público por definição (é a presença do link no
 * site), enquanto "tem o recurso mas escondeu o link" é informação comercial da
 * imobiliária. Com o colapso, os dois casos ficam indistinguíveis de fora.
 *
 * A coluna crua NÃO é alterada: quando o recurso voltar, a escolha dela volta
 * junto. Por isso `tenant.put.ts` recusa gravar o campo sem entitlement.
 */
async function comLinksEfetivos(tenant: Tenant | null): Promise<Tenant | null> {
  if (!tenant) return tenant

  // Curto-circuito por flag: quem não ligou o link não paga a consulta dele. É
  // a maioria em ambos, e isto roda a cada resolução de host com cache frio.
  //
  // As duas consultas vão juntas quando os dois estão ligados. Sequenciar seria
  // somar duas idas ao banco no caminho mais quente do site.
  const [portalEnabled, aboutEnabled] = await Promise.all([
    tenant.portalEnabled ? areaClienteAtiva(tenant.id) : Promise.resolve(false),
    tenant.aboutEnabled ? quemSomosAtiva(tenant.id) : Promise.resolve(false),
  ])

  return { ...tenant, portalEnabled, aboutEnabled }
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
