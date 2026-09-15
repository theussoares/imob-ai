import { ADMIN_HOST_PREFIX, isAdminHost } from '~~/server/utils/tenant'

/**
 * O que fazer com uma requisição que chegou no host do painel.
 *
 * Decisão separada do middleware para poder ser testada sem montar um evento
 * do h3 — a regra é de roteamento e tem três saídas que não podem se confundir.
 */
export type AdminHostAction =
  | { kind: 'passa' }
  /** Rota pública no host do painel: o painel é exclusivo deste host. */
  | { kind: 'admin' }
  /** Área do Cliente: mora no domínio público, e é para lá que vai. */
  | { kind: 'portal'; url: string }

/** Caminhos que precisam responder no host do painel para o painel existir. */
function ehInfra(path: string): boolean {
  return (
    path.startsWith('/admin') ||
    path.startsWith('/api/') ||
    path.startsWith('/_') ||
    path.startsWith('/__') ||
    path.startsWith('/favicon') ||
    path.startsWith('/.well-known/') ||
    // Continua servido, com Disallow: / — ver robots.txt.get.ts.
    path === '/robots.txt'
  )
}

export function adminHostAction(hostname: string, fullPath: string): AdminHostAction {
  const path = (fullPath || '').split('?')[0] || '/'

  if (ehInfra(path)) return { kind: 'passa' }
  if (!isAdminHost(hostname)) return { kind: 'passa' }

  // A Área do Cliente mora no domínio PÚBLICO da imobiliária. Mandá-la para
  // /admin como o resto colocaria o inquilino na tela de login da imobiliária,
  // onde a senha dele não funciona — e ele ligaria para a imobiliária dizendo
  // que "o site não aceita a senha".
  //
  // O domínio público é derivável do próprio host (`painel.olmi.com.br` ->
  // `olmi.com.br`), sem consulta ao banco e sem depender da resolução de tenant,
  // que roda depois deste middleware.
  if (path === '/area-cliente' || path.startsWith('/area-cliente/')) {
    const publico = hostname.slice(ADMIN_HOST_PREFIX.length)
    // A query é preservada porque o link de convite carrega o token nela:
    // perdê-la transforma "definir senha" em "link inválido".
    const query = (fullPath || '').slice(path.length)
    return { kind: 'portal', url: `https://${publico}${path}${query}` }
  }

  return { kind: 'admin' }
}
