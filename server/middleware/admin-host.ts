import { isAdminHost, getHostname } from '~~/server/utils/tenant'

/**
 * `painel.<dominio>` serve EXCLUSIVAMENTE o admin: qualquer rota pública nesse
 * host é redirecionada para /admin.
 *
 * Sem isso o catálogo responderia tanto em `dominio.com.br` quanto em
 * `painel.dominio.com.br` — dois hosts servindo o mesmo conteúdo, cada um se
 * auto-canonicalizando (o mesmo tipo de duplicação que já corrigimos no
 * fallback de tenant).
 *
 * Roda antes do middleware de tenant (ordem alfabética) para economizar a
 * resolução no banco quando a resposta vai ser um redirect.
 */
export default defineEventHandler((event) => {
  const path = (event.path || '').split('?')[0] || '/'

  // Assets, APIs e as próprias rotas do admin passam direto. Sem esta lista o
  // painel não carregaria: o admin é SPA e consome /api/admin/* e /_nuxt/*.
  if (
    path.startsWith('/admin') ||
    path.startsWith('/api/') ||
    path.startsWith('/_') ||
    path.startsWith('/__') ||
    path.startsWith('/favicon') ||
    path.startsWith('/.well-known/')
  ) {
    return
  }

  if (!isAdminHost(getHostname(event))) return

  // robots.txt continua sendo servido (com Disallow: /) — ver robots.txt.get.ts.
  if (path === '/robots.txt') return

  return sendRedirect(event, '/admin', 302)
})
