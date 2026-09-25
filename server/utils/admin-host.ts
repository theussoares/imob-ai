import { ADMIN_HOST_PREFIX, isAdminHost } from '~~/shared/utils/admin-host'
import { isPwaPath } from '~~/server/utils/pwa'

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
  /**
   * Área do Cliente: mora no domínio público.
   *
   * Devolve o host CANDIDATO e o destino separados, de propósito — não uma URL
   * pronta. O host sai de `getHostname`, que confia em `X-Forwarded-Host`, ou
   * seja: é dado do cliente. Montar a URL aqui faria esta função devolver um
   * destino absoluto controlável por quem manda o header, e o middleware o
   * emitiria sem nunca ter conferido que aquele host é nosso.
   *
   * Quem valida é o middleware, resolvendo o tenant do host antes de redirecionar.
   */
  | { kind: 'portal'; hostPublico: string; destino: string }

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
    path === '/robots.txt' ||
    // O PWA do painel VIVE neste host: manifest, service worker e os
    // assets do Workbox. Redirecioná-los para /admin devolveria HTML onde o
    // navegador espera JSON ou JavaScript — o app instalado para de atualizar
    // e a instalação deixa de ser oferecida, sem erro visível.
    isPwaPath(path)
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
    //
    // ⚠️ E é justamente por carregar token que o host precisa ser validado pelo
    // middleware antes de virar redirect: um `X-Forwarded-Host` forjado faria
    // este caminho apontar o token da vítima para o servidor de quem forjou.
    const query = (fullPath || '').slice(path.length)
    return { kind: 'portal', hostPublico: publico, destino: `${path}${query}` }
  }

  return { kind: 'admin' }
}
