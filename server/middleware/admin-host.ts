import { getHostname } from '~~/server/utils/tenant'
import { adminHostAction } from '~~/server/utils/admin-host'

/**
 * `painel.<dominio>` serve EXCLUSIVAMENTE o admin: qualquer rota pública nesse
 * host é redirecionada para /admin.
 *
 * Sem isso o catálogo responderia tanto em `dominio.com.br` quanto em
 * `painel.dominio.com.br` — dois hosts servindo o mesmo conteúdo, cada um se
 * auto-canonicalizando (o mesmo tipo de duplicação que já corrigimos no
 * fallback de tenant).
 *
 * A exceção é `/area-cliente`, que mora no domínio público e é mandada para lá
 * em vez de para /admin — ver `adminHostAction`, onde a regra vive e é testada.
 *
 * Roda antes do middleware de tenant (ordem alfabética) para economizar a
 * resolução no banco quando a resposta vai ser um redirect.
 */
export default defineEventHandler((event) => {
  const acao = adminHostAction(getHostname(event), event.path || '/')
  if (acao.kind === 'passa') return
  if (acao.kind === 'portal') return sendRedirect(event, acao.url, 302)
  return sendRedirect(event, '/admin', 302)
})
