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


/** O que aconteceu com uma chamada que falhou, do ponto de vista de quem vê. */
export type TipoDeFalha = 'sessao' | 'rede' | 'permissao' | 'nao_encontrado' | 'servidor'

/**
 * Classifica a falha para a tela dizer o que fazer.
 *
 * "Não foi possível carregar" serve para tudo e não ajuda em nada: quem está
 * sem internet tenta de novo em vão, e quem está com a sessão caída não
 * descobre que precisa entrar outra vez.
 *
 * `rede` é o caso sem status nenhum — o fetch nem chegou ao servidor. É o mais
 * comum no celular, que é onde o portal é usado, e o único em que "tente de
 * novo" é conselho útil.
 */
export function classificarFalha(e: unknown): TipoDeFalha {
  if (isSessionExpiredError(e)) return 'sessao'
  if (!e || typeof e !== 'object') return 'servidor'

  const err = e as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
  const status = Number(err.statusCode ?? err.status ?? err.response?.status ?? 0)

  if (!status) return 'rede'
  if (status === 403) return 'permissao'
  if (status === 404) return 'nao_encontrado'
  return 'servidor'
}

/** A frase que a pessoa lê, por tipo de falha. */
export const MENSAGEM_DE_FALHA: Record<TipoDeFalha, string> = {
  sessao: 'Sua sessão expirou. Entre novamente para continuar.',
  rede: 'Não conseguimos falar com o servidor. Verifique sua conexão e tente de novo.',
  permissao: 'Este item não está disponível para o seu acesso.',
  nao_encontrado: 'Não encontramos o que você procurava.',
  servidor: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
}
