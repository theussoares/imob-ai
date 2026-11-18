/**
 * Cliente HTTP do painel em modo `http`: $fetch + `Authorization: Bearer` + erros traduzidos.
 *
 * `$fetch` e o provedor de token entram por parâmetro — é o que deixa a mesma suíte de contrato
 * rodar contra um servidor falso (`test/services/contrato-gestao.test.ts`) sem subir o Nuxt.
 * O token NUNCA sai daqui para storage: quem o guarda é `tokensGestao.ts`, em memória.
 */

/** Falha já traduzida para a tela: a frase do servidor é a do domínio, a tela só a mostra. */
export interface Falha {
  ok: false
  erro: string
  /** 409 de versão: outra pessoa gravou antes. A tela avisa e recarrega. */
  conflito?: boolean
  /** 401: o token não vale mais (ou o 2º fator não foi cumprido). */
  sessaoExpirada?: boolean
  /** 429: segundos até poder tentar de novo. */
  segundos?: number
  /** código do servidor (`bloqueado`, `invalido`, `conta_existente`…), quando há. */
  motivo?: string
  restantes?: number
}

export type Fetcher = <T = unknown>(
  url: string,
  opts?: { method?: string; body?: unknown; query?: Record<string, unknown>; headers?: Record<string, string> },
) => Promise<T>

export class ErroGestao extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly extra: { motivo?: string; segundos?: number; restantes?: number } = {},
  ) {
    super(mensagem)
  }
}

export const MSG_CONFLITO = 'Este registro foi alterado por outra pessoa. Recarregue a página.'
const MSG_SESSAO = 'Sua sessão expirou. Entre de novo.'
const MSG_REDE = 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.'

interface CorpoErro {
  statusMessage?: string
  message?: string
  data?: { erro?: string; motivo?: string; segundos?: number; restantes?: number }
}

/** Lê o erro do `$fetch` (FetchError do ofetch ou o `createError` do h3) sem depender da classe. */
export function traduzirErro(e: unknown): ErroGestao {
  if (e instanceof ErroGestao) return e
  const x = e as { status?: number; statusCode?: number; response?: { status?: number }; statusMessage?: string; data?: CorpoErro } | null
  const status = x?.status ?? x?.statusCode ?? x?.response?.status ?? 0
  if (!status) return new ErroGestao(MSG_REDE, 0)
  const corpo = x?.data
  const mensagem = corpo?.data?.erro ?? corpo?.statusMessage ?? x?.statusMessage ?? corpo?.message ?? 'Não foi possível concluir.'
  return new ErroGestao(status === 401 && !corpo?.statusMessage ? MSG_SESSAO : mensagem, status, {
    motivo: corpo?.data?.motivo,
    segundos: corpo?.data?.segundos,
    restantes: corpo?.data?.restantes,
  })
}

/** Mensagem crua de validação (Zod, em inglês) nunca vai para a tela. */
const soEmPortugues = (m: string): string => (/^(invalid|expected|required)\b|expected .* received/i.test(m) ? 'Dados inválidos. Confira os campos e tente de novo.' : m)

export function paraFalha(e: unknown): Falha {
  const t = traduzirErro(e)
  return {
    ok: false,
    erro: t.status === 409 && !/alterad[oa]/i.test(t.message) ? MSG_CONFLITO : soEmPortugues(t.message),
    ...(t.status === 409 && { conflito: true as const }),
    ...(t.status === 401 && { sessaoExpirada: true as const }),
    ...(t.extra.segundos !== undefined && { segundos: t.extra.segundos }),
    ...(t.extra.motivo !== undefined && { motivo: t.extra.motivo }),
    ...(t.extra.restantes !== undefined && { restantes: t.extra.restantes }),
  }
}

type Consulta = Record<string, string | number | boolean | undefined>

export interface ClienteGestao {
  get<T>(url: string, query?: Consulta): Promise<T>
  post<T>(url: string, body?: unknown, opcoes?: { semToken?: boolean }): Promise<T>
  put<T>(url: string, body?: unknown): Promise<T>
  patch<T>(url: string, body?: unknown): Promise<T>
  del<T>(url: string): Promise<T>
}

export function criarClienteGestao(deps: {
  fetcher: Fetcher
  /** Token de acesso vigente (já renovado, se preciso). `null` = sem sessão. */
  token: () => string | null | Promise<string | null>
  /** Chamado em 401 de chamada AUTENTICADA (login com senha errada também é 401 e não conta). */
  aoSessaoExpirada?: () => void
}): ClienteGestao {
  async function chamar<T>(method: string, url: string, body?: unknown, query?: Consulta, semToken = false): Promise<T> {
    const token = semToken ? null : await deps.token()
    try {
      return await deps.fetcher<T>(url, {
        method,
        ...(body !== undefined && { body }),
        ...(query && { query }),
        ...(token && { headers: { Authorization: `Bearer ${token}` } }),
      })
    } catch (e) {
      const t = traduzirErro(e)
      if (t.status === 401 && !semToken) deps.aoSessaoExpirada?.()
      throw t
    }
  }
  return {
    get: (url, query) => chamar('GET', url, undefined, query),
    post: (url, body, o) => chamar('POST', url, body ?? {}, undefined, o?.semToken),
    put: (url, body) => chamar('PUT', url, body ?? {}),
    patch: (url, body) => chamar('PATCH', url, body ?? {}),
    del: (url) => chamar('DELETE', url),
  }
}
