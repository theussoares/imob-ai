import { getHostname, isAdminHost, resolveTenantForHost } from '~~/server/utils/tenant'
import { buildPanelManifest } from '~~/server/utils/pwa'
import { safeBrandColor, DEFAULT_BRAND_COLOR } from '~~/server/utils/brand'

/**
 * Manifest do PWA do painel, montado por host.
 *
 * É rota e não arquivo estático pelo mesmo motivo do favicon e do robots.txt: o
 * conteúdo varia por cliente. Aqui isso não é conveniência, é exigência — um
 * manifest precisa de `start_url` relativo à própria origem, e cada cliente tem
 * a sua (`painel.imobiliaria.com.br`). Um arquivo só não serviria N domínios.
 *
 * Só responde em host de painel. Instalar o SITE do cliente não está no escopo,
 * e servir manifest no domínio público convidaria o navegador a oferecer isso.
 *
 * O tenant é resolvido aqui dentro, como no favicon: `isPwaPath` faz o
 * middleware de tenant pular esta rota, justamente para que banco fora não a
 * derrube antes do fallback abaixo.
 *
 * O ícone é o da plataforma, não o do cliente. A instalabilidade exige PNG real
 * em 192 e 512 — SVG não basta no fluxo do Android — e `logo_url` tem proporção
 * arbitrária, então derivar dele daria ícone torto. Nome e cor já são do
 * cliente; o ícone entra quando houver geração de imagem no servidor.
 */
export default defineEventHandler(async (event) => {
  const hostname = getHostname(event)

  if (!isAdminHost(hostname)) {
    throw createError({ statusCode: 404, statusMessage: 'Manifest disponível apenas no painel.' })
  }

  let nome: string | null = null
  let cor = DEFAULT_BRAND_COLOR

  try {
    const tenant = await resolveTenantForHost(hostname)
    if (tenant) {
      nome = tenant.name
      cor = safeBrandColor(tenant.brandPrimary)
    }
  } catch (e) {
    // Banco fora não pode derrubar o manifest: o navegador o pede junto com a
    // página, e um 500 aqui apareceria como erro no console de quem só queria
    // abrir o painel. Sem o tenant, cai no nome e na cor da plataforma.
    logWarn('manifest.tenant_lookup_failed', { host: hostname, reason: errMessage(e) })
  }

  setHeader(event, 'content-type', 'application/manifest+json; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')

  return buildPanelManifest(nome, cor)
})
