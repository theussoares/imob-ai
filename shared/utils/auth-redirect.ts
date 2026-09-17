/**
 * Telas que sabem consumir o token e pedir a senha nova. São DUAS, e confundi-las
 * é o bug que este arquivo já causou.
 *
 * O painel e o portal têm fluxos de senha separados porque são públicos
 * diferentes: quem define senha pelo painel é membro da imobiliária, quem define
 * pelo portal é cliente dela. Mandar um para a tela do outro termina em "sua
 * conta não tem acesso a esta imobiliária" — mensagem correta para o middleware
 * que a emite e incompreensível para quem só clicou num convite.
 */
export const SET_PASSWORD_PATH = '/admin/definir-senha'
export const SET_PASSWORD_PATH_PORTAL = '/area-cliente/definir-senha'

/** Prefixo do portal. Com a barra: `/area-clientes-fake` não é o portal. */
const PORTAL_PREFIX = '/area-cliente'

/** Tipos de link que essa tela trata. Outros seguem o fluxo normal do Supabase. */
const HANDLED_TYPES = ['invite', 'recovery']

/**
 * Para onde levar quando um link de autenticação do Supabase cai na página
 * errada.
 *
 * Existe por causa de uma falha real: a allowlist de Redirect URLs do Supabase
 * não casava com o caminho (`https://*.dominio.com.br` só casa com URL SEM path,
 * porque `*` não atravessa `/`), o `redirect_to` foi descartado e o convite caiu
 * no Site URL — uma página que ignora o token. A pessoa não vê erro, só uma
 * página comum, e o convite parece quebrado.
 *
 * Corrigir a allowlist resolve a causa; isto aqui garante que uma allowlist
 * incompleta não transforme o convite em beco sem saída. Basta o token chegar em
 * QUALQUER página do app.
 *
 * Devolve o destino (com o hash preservado — é ele que carrega o token) ou
 * `null` quando não há nada a fazer.
 */
export function authHashTarget(hash: string, currentPath: string): string | null {
  if (!hash || !hash.includes('access_token=')) return null

  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const type = params.get('type')
  if (!type || !HANDLED_TYPES.includes(type)) return null

  // Já está numa tela que sabe consumir: redirecionar de novo viraria laço no
  // caso do painel e, no caso do portal, jogaria fora um token que acabou de
  // chegar no lugar CERTO.
  //
  // ⚠️ Esta segunda metade é o conserto de 17/09. Antes, a comparação olhava só
  // para a tela do painel, então todo convite do portal — que aterrissa em
  // `/area-cliente/definir-senha` porque o `redirect_to` e a allowlist estão
  // corretos — era sequestrado para o painel. O cliente definia a senha na tela
  // errada e caía em "sua conta não tem acesso a esta imobiliária".
  if (currentPath === SET_PASSWORD_PATH || currentPath === SET_PASSWORD_PATH_PORTAL) return null

  // Para onde resgatar depende de ONDE o token caiu, porque o `type` do hash não
  // distingue os dois fluxos: `invite` é `invite` para membro e para cliente.
  // O caminho de aterrissagem é a única pista que existe, e ela acerta o caso
  // que importa — token perdido dentro do portal fica no portal.
  const destino = ehDoPortal(currentPath) ? SET_PASSWORD_PATH_PORTAL : SET_PASSWORD_PATH
  return `${destino}${hash.startsWith('#') ? hash : `#${hash}`}`
}

function ehDoPortal(path: string): boolean {
  return path === PORTAL_PREFIX || path.startsWith(`${PORTAL_PREFIX}/`)
}
