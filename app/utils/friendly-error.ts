/**
 * Traduz erro técnico (Supabase Auth/Storage/Postgrest, falha de rede) numa
 * frase que a pessoa que usa o painel entende — nunca a frase crua do banco.
 *
 * Existe porque "new row violates row-level security policy for table
 * \"objects\"" chegou a aparecer num toast: preciso pra quem depura,
 * incompreensível pra quem só queria subir uma foto. As mensagens que o NOSSO
 * servidor manda (`statusMessage` de `createError`, em server/utils/validate.ts)
 * já nascem em português e não passam por aqui — isto cobre só o que vem direto
 * de um serviço de terceiro.
 */

interface Regra {
  test: RegExp
  message: string
}

const REGRAS: Regra[] = [
  {
    // RLS: sessão válida mas sem permissão para aquela linha/pasta (ex.: token
    // expirou entre carregar a tela e enviar, ou perdeu acesso à imobiliária).
    test: /row-level security|permission denied/i,
    message: 'Você não tem permissão para fazer isso agora. Atualize a página e tente de novo.',
  },
  {
    test: /jwt|token.*expired|expired.*token/i,
    message: 'Sua sessão expirou. Atualize a página e entre novamente.',
  },
  {
    test: /failed to fetch|networkerror|load failed|network request failed/i,
    message: 'Falha de conexão. Verifique sua internet e tente novamente.',
  },
  {
    test: /payload too large|exceeded the maximum allowed size/i,
    message: 'Arquivo muito grande. Tente uma imagem menor.',
  },
  {
    test: /invalid login credentials/i,
    message: 'E-mail ou senha incorretos.',
  },
  {
    test: /should be different from the old password|same_password/i,
    message: 'A nova senha precisa ser diferente da atual.',
  },
  {
    test: /password.*at least|should be at least \d+ characters/i,
    message: 'A senha é curta demais.',
  },
]

function extractMessage(e: unknown): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return ''
}

/**
 * `fallback` é o que aparece quando nenhuma regra reconhece o erro — sempre
 * genérico e nunca a mensagem original, que pode conter detalhe técnico
 * (nome de coluna, código de tabela) sem qualquer utilidade para quem lê.
 */
export function friendlyErrorMessage(e: unknown, fallback = 'Não foi possível concluir. Tente novamente.'): string {
  const msg = extractMessage(e)
  return REGRAS.find((r) => r.test.test(msg))?.message ?? fallback
}
