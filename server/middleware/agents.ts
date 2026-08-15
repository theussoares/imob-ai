import { listActiveProperties } from '~~/server/repositories/property.repository'

/**
 * Descoberta por agentes/IA nas páginas públicas:
 * - Link headers (RFC 8288) apontando para o api-catalog e o sitemap
 * - Negociação de conteúdo: `Accept: text/markdown` devolve uma versão markdown
 *   da home e das páginas de imóvel (HTML segue sendo o padrão para navegadores)
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return
  const path = (event.path || '').split('?')[0]
  const isHome = path === '/'
  const isProperty = path.startsWith('/imovel/')
  if (!isHome && !isProperty) return

  // Domínio-raiz da plataforma não tem catálogo. Sem este guard, o fallback de
  // tenant lá embaixo serviria o catálogo do tenant padrão como se fosse a
  // landing da Moradi (e o Link header apontaria pra um /llms.txt que dá 404).
  if (event.context.platformRoot) return

  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  // RFC 8288 — Link headers para descoberta
  appendResponseHeader(event, 'Link', `<${origin}/.well-known/api-catalog>; rel="api-catalog"`)
  appendResponseHeader(event, 'Link', `<${origin}/sitemap.xml>; rel="sitemap"`)
  appendResponseHeader(event, 'Link', `<${origin}/llms.txt>; rel="alternate"; type="text/markdown"`)
  appendResponseHeader(event, 'Vary', 'Accept')

  // Markdown for Agents
  const accept = getHeader(event, 'accept') || ''
  if (!accept.includes('text/markdown')) return

  const tenant = event.context.tenant ?? (await resolveTenantForHost(getHostname(event)))
  if (!tenant) return

  const list = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
    listActiveProperties(publicSupabase(), tenant.id),
  )

  let md: string
  if (isProperty) {
    const code = decodeURIComponent(path.slice('/imovel/'.length))
    const property = list.find((p) => p.code.toLowerCase() === code.toLowerCase())
    if (!property) return // deixa o fluxo normal responder (404)
    md = propertyMarkdown(tenant, property, origin)
  } else {
    md = tenantCatalogMarkdown(tenant, list, origin)
  }

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=600')
  return md
})
