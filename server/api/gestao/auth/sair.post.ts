import { limparRefreshGestao } from '~~/server/utils/gestao-cookie'

/**
 * Encerra a sessão: apaga o cookie do refresh token e revoga esta sessão no
 * Supabase. Sempre responde 204, mesmo sem cookie ou com token inválido: sair
 * nunca pode falhar para o usuário, e a resposta não revela se havia sessão.
 */
export default defineEventHandler(async (event) => {
  // Origin de outro site (formulário externo): não apaga o cookie, para ninguém forçar o logout alheio.
  const origem = getHeader(event, 'origin')
  const mesmaOrigem = !origem || (() => { try { return new URL(origem).host === getRequestHost(event) } catch { return false } })()
  if (!mesmaOrigem) {
    setResponseStatus(event, 204)
    return null
  }
  limparRefreshGestao(event)
  const bearer = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '')
  // `local`: só esta sessão, como o signOut do client fazia; as de outros aparelhos seguem.
  if (bearer) await serviceSupabase().auth.admin.signOut(bearer, 'local').catch(() => {})
  setResponseStatus(event, 204)
  return null
})
