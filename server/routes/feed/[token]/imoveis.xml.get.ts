import { feedTokenMatches, listPropertiesForPortalFeed } from '~~/server/repositories/portal-feed.repository'

/**
 * Feed VRSync para o Canal Pro (ZAP, Viva Real, OLX).
 *
 * A imobiliária copia a URL em Configurações e cola no Canal Pro; o portal
 * busca o arquivo periodicamente. O XML é montado por `buildVrsyncFeed`.
 *
 * O token no caminho existe porque o feed carrega CEP e rua de cada imóvel
 * (sem eles o Canal Pro recusa o anúncio). Aberto em `/feed/imoveis.xml`, como
 * era, qualquer um baixaria o endereço de todos os imóveis anunciados. Token na
 * QUERY foi descartado: o Canal Pro guarda a URL como está, e alguns
 * validadores de URL de feed cortam a query ao exibir/copiar.
 *
 * Resposta para token errado é 404, não 403: 403 confirmaria que existe feed
 * neste domínio e que só falta acertar o token.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const token = getRouterParam(event, 'token') || ''

  const client = serviceSupabase()
  if (!(await feedTokenMatches(client, tenant.id, token))) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // Sem o cache compartilhado do catálogo (`properties:active`): aquele guarda
  // o modelo PÚBLICO, sem endereço, e misturar os dois numa chave só seria o
  // jeito mais curto de o endereço acabar no sitemap.
  const properties = await listPropertiesForPortalFeed(client, tenant.id)
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  const { xml } = buildVrsyncFeed({
    providerName: tenant.name,
    contato: {
      name: tenant.name || '',
      email: tenant.email || '',
      // wa.me/tel: guardam dígitos com DDI; o portal aceita o número em texto.
      phone: (tenant.whatsapp || tenant.phone || '').replace(/\D/g, ''),
    },
    properties,
    origin,
  })

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // `private`: com endereço dentro, nenhum CDN no caminho deve guardar cópia.
  // 10 min no cliente basta — o portal busca poucas vezes por dia.
  setHeader(event, 'cache-control', 'private, max-age=600')
  setHeader(event, 'x-robots-tag', 'noindex')
  return xml
})
