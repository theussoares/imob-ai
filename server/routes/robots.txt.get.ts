import { getHostname, isAdminHost, isPlatformRootHost, resolveTenantForHost } from '~~/server/utils/tenant'

/** robots.txt dinâmico por host, apontando para o sitemap do tenant. */
export default defineEventHandler(async (event) => {
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const hostname = getHostname(event)
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')

  // Nada a indexar em dois casos:
  // - painel.<dominio>, que serve exclusivamente o admin;
  // - host desconhecido (ex.: <projeto>.vercel.app), que exibe a landing e seria
  //   a LP duplicada em outro domínio.
  //
  // A classificação é feita aqui, e não lida de event.context: o middleware de
  // tenant pula /robots.txt de propósito (para não falhar se o banco estiver
  // fora), então justamente nesta rota o contexto nunca vem preenchido.
  let blocked = isAdminHost(hostname)
  if (!blocked && !event.context.tenant && !isPlatformRootHost(hostname)) {
    try {
      blocked = !(await resolveTenantForHost(hostname))
    } catch (e) {
      // Banco fora: melhor permitir do que arriscar servir Disallow para o
      // Googlebot no site de um cliente real e derrubar a indexação dele.
      logWarn('robots.tenant_lookup_failed', { host: hostname, reason: errMessage(e) })
      blocked = false
    }
  }

  if (blocked) {
    return ['User-agent: *', 'Disallow: /', ''].join('\n')
  }

  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    // Content Signals (contentsignals.org): permitir busca e respostas de IA
    // com atribuição; não permitir uso para treinamento de modelos.
    'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
})
