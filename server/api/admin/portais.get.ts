import { ADMIN_HOST_PREFIX, isAdminHost } from '~~/shared/utils/admin-host'
import { getPrimaryDomain } from '~~/server/repositories/tenant.repository'
import { getOrCreateFeedToken, listPropertiesForPortalFeed } from '~~/server/repositories/portal-feed.repository'
import { pendenciasVrsync } from '~~/shared/utils/vrsync'

/**
 * Link do feed dos portais e o que impede cada imóvel publicado de subir.
 *
 * A lista de pendências é a razão de este endpoint existir. Antes o painel só
 * mostrava o link, e o link "funcionava" — abria um XML. Quem descobria que
 * nenhum anúncio tinha subido era o cliente, dias depois, no Canal Pro.
 *
 * O host do link sai do domínio PRIMÁRIO, não da barra de endereço do painel.
 * `painel.olmiimoveis.com.br` virava `olmiimoveis.com.br`, que a Vercel
 * redireciona (308) para o `www.` — e robô de portal não tem obrigação de
 * seguir redirect. Sem domínio primário (tenant só no subdomínio da
 * plataforma), vale o host do painel sem o `painel.`.
 *
 * Service role: `portal_feeds` e as colunas de endereço não abrem para
 * `authenticated`. O `tenant.id` vem de `requireTenantMember`.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const client = serviceSupabase()

  const [token, primario, imoveis] = await Promise.all([
    getOrCreateFeedToken(client, tenant.id),
    getPrimaryDomain(client, tenant.id),
    listPropertiesForPortalFeed(client, tenant.id),
  ])

  // Fora de produção o primário aponta para o site no ar, e o link levaria
  // quem testa um preview para o feed de produção — que ainda não tem a mudança.
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  const hostAtual = isAdminHost(url.host) ? url.host.slice(ADMIN_HOST_PREFIX.length) : url.host
  const origem =
    primario && !useRuntimeConfig().allowTenantSwitch
      ? `https://${primario}`
      : `${url.protocol}//${hostAtual}`

  const pendentes = imoveis
    .map((p) => ({ id: p.id, code: p.code, title: p.title, pendencias: pendenciasVrsync(p) }))
    .filter((p) => p.pendencias.length)

  return {
    feedUrl: `${origem}/feed/${token}/imoveis.xml`,
    publicados: imoveis.length,
    prontos: imoveis.length - pendentes.length,
    pendentes,
  }
})
