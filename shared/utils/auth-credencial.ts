/**
 * A credencial que o link de convite/recuperação carrega.
 *
 * `code` é o fluxo PKCE; `tokens` é o implícito. Qual dos dois chega depende de
 * configuração do projeto no Supabase, não do nosso código — por isso as duas
 * telas tratam os dois, e não o que "deveria" estar ligado.
 */
export type Credencial =
  | { tipo: 'code'; code: string }
  | { tipo: 'tokens'; accessToken: string; refreshToken: string }
  | null

/**
 * Lê a credencial da URL em que a pessoa caiu.
 *
 * Isto estava copiado LITERALMENTE nas duas telas de definir senha (painel e
 * Área do Cliente). A lógica é a mesma; o que difere de verdade é só o client
 * do Supabase e o destino depois de salvar. Duas cópias de uma coisa que não
 * varia é uma que vai derivar da outra — e já tinha derivado, no tratamento de
 * erro.
 *
 * `null` NÃO significa link inválido: quem já tinha sessão e digitou o endereço
 * direto também chega sem credencial na URL. Quem decide é a tela, consultando
 * a sessão existente antes de se declarar inválida.
 */
export function credencialDaUrl(href: string): Credencial {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    // Melhor cair no estado "link inválido", que ao menos explica o que houve,
    // do que numa exceção que deixa o cartão vazio na tela.
    return null
  }

  // O código vence os tokens quando os dois vêm juntos. É a ordem que as duas
  // telas já tinham, e ela não pode passar a depender de qual arquivo alguém
  // editou por último.
  const code = url.searchParams.get('code')
  if (code) return { tipo: 'code', code }

  // `URLSearchParams` já faz o percent-decode: o Supabase encoda os tokens, e
  // entregar o valor cru faria a sessão ser recusada por um `+` que virou `%2B`.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  // Os dois, ou nenhum: `setSession` exige o par, e mandar um pela metade
  // troca o caminho da sessão existente por um erro do Supabase.
  if (accessToken && refreshToken) return { tipo: 'tokens', accessToken, refreshToken }

  return null
}

/** Mínimo de caracteres da senha. É a regra do Supabase Auth do projeto. */
const MINIMO_DA_SENHA = 8

/**
 * Valida o par senha/confirmação. Devolve a frase a mostrar, ou `null`.
 *
 * A ordem importa: o tamanho vem ANTES da diferença. Com os dois problemas ao
 * mesmo tempo, apontar a diferença faria a pessoa corrigir a confirmação e
 * esbarrar no tamanho logo depois — dois erros em sequência para um
 * preenchimento só.
 */
export function validarNovaSenha(senha: string, confirmacao: string): string | null {
  if (senha.length < MINIMO_DA_SENHA) {
    return `A senha precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.`
  }
  if (senha !== confirmacao) return 'As duas senhas não são iguais.'
  return null
}
