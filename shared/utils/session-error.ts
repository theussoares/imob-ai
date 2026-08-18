/**
 * O erro veio de sessão que caiu (401)?
 *
 * Só 401. Um 403 é "está logada, mas não é membro desta imobiliária" — mandar
 * relogar não resolveria e esconderia o problema de verdade.
 *
 * O status aparece em lugares diferentes conforme como o erro do ofetch é
 * capturado, e reconhecer só um formato deixaria o aviso mudo justamente no
 * caso que ele existe para cobrir.
 */
export function isSessionExpiredError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
  return err.statusCode === 401 || err.status === 401 || err.response?.status === 401
}
