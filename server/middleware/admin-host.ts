import { getHostname, resolveTenantForHost } from '~~/server/utils/tenant'
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
export default defineEventHandler(async (event) => {
  const acao = adminHostAction(getHostname(event), event.path || '/')
  if (acao.kind === 'passa') return

  if (acao.kind === 'portal') {
    // ⚠️ O host vem de `getHostname`, que confia em `X-Forwarded-Host` — dado do
    // cliente. Redirecionar para ele sem conferir seria um open redirect que
    // CARREGA CREDENCIAL: o destino recebe a query, e é nela que o Supabase põe
    // o `?code=` do convite e da recuperação de senha. Quem forjasse o header
    // receberia o token da vítima e assumiria a conta.
    //
    // Resolver o tenant responde "este host é nosso?". É consulta cacheada e
    // este caminho é raro (só /area-cliente no host do painel), então o custo
    // não paga o risco de confiar no header.
    const tenant = await resolveTenantForHost(acao.hostPublico)
    if (!tenant) {
      logWarn('adminhost.destino_recusado', { host: acao.hostPublico })
      return sendRedirect(event, '/admin', 302)
    }
    return sendRedirect(event, `https://${acao.hostPublico}${acao.destino}`, 302)
  }

  return sendRedirect(event, '/admin', 302)
})
