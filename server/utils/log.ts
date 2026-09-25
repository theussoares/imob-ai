/**
 * Log estruturado (JSON por linha) para o log de funções da Vercel.
 *
 * Existe porque falhas hoje são silenciosas: se a gravação de um lead quebrar em
 * produção, o visitante vê erro e ninguém fica sabendo — o lead simplesmente some.
 * Todo bug desta base foi descoberto por alguém reparando, nunca pelo sistema avisando.
 *
 * ⚠️ NUNCA passe PII aqui (nome, telefone, e-mail, mensagem do lead). Log é lido
 * por várias pessoas, fica retido e sai do controle do titular do dado. Use
 * identificadores (tenant, código do imóvel) e o motivo do erro.
 */

type Detail = Record<string, unknown>

function emit(level: 'error' | 'warn', event: string, detail: Detail) {
  // JSON em uma linha: fica greppável no painel da Vercel e pronto pra ser
  // ingerido por uma ferramenta de agregação depois, sem reescrever nada.
  const line = JSON.stringify({ level, event, ...detail, at: new Date().toISOString() })
  if (level === 'error') console.error(line)
  else console.warn(line)
}

/** Falha que custa algo ao negócio (lead perdido, config ausente). */
export function logError(event: string, detail: Detail = {}) {
  emit('error', event, detail)
}

/**
 * Degradação tolerada — o código seguiu em frente de propósito, mas alguém
 * precisa saber que aconteceu (ex.: checagem de limite que não pôde rodar).
 */
export function logWarn(event: string, detail: Detail = {}) {
  emit('warn', event, detail)
}

/**
 * Extrai mensagem de erro sem arrastar objeto inteiro (que pode conter payload).
 *
 * O erro do Supabase (`PostgrestError`) NÃO é `instanceof Error`: é objeto
 * simples com `message`, e os repositories o lançam cru. Sem o terceiro ramo,
 * toda falha de banco chegava ao log como "erro desconhecido" — inclusive a de
 * tabela inexistente, que é a primeira coisa a conferir depois de um deploy com
 * migration pendente. Pega só o `message`; `details` e `hint` podem trazer o
 * valor da linha.
 */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return 'erro desconhecido'
}
