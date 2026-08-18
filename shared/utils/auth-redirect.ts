/** Tela que sabe consumir o token e pedir a senha nova. */
export const SET_PASSWORD_PATH = '/admin/definir-senha'

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

  // Já está no lugar certo: redirecionar de novo viraria laço.
  if (currentPath === SET_PASSWORD_PATH) return null

  return `${SET_PASSWORD_PATH}${hash.startsWith('#') ? hash : `#${hash}`}`
}
