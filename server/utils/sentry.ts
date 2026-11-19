/**
 * Envio de erros ao Sentry, com o dado pessoal removido ANTES de sair do servidor.
 *
 * ## Por que um envelope à mão e não o SDK
 *
 * `@sentry/node` instrumenta módulos por OpenTelemetry e coleta por padrão IP, cabeçalhos, cookies e corpo
 * da requisição: o contrário do que este projeto promete na política de privacidade, e desligar tudo isso
 * item a item é uma lista que vaza sozinha quando o SDK ganha um default novo. Aqui só sai o que `montarEvento`
 * escreve (nome do evento, motivo, stack, etiquetas da imobiliária) e o texto passa por `limparTexto`.
 * O custo: não há breadcrumbs nem tracing, que não queremos mesmo. Sem DSN configurada tudo isto é no-op,
 * como o captcha sem secret: o log da Vercel continua sendo a fonte.
 *
 * Só o servidor reporta. Erro de navegador do site público mandaria IP e URL de visitante a um terceiro
 * (a política diz com quem compartilhamos); se for preciso, entra depois, no /gestao e /admin só.
 */

export interface DsnSentry {
  chave: string
  host: string
  projeto: string
}

/** `https://<chave>@<host>/<projeto>`. Qualquer outra coisa é "sem Sentry", não erro: o log nunca derruba a requisição. */
export function lerDsn(dsn: string): DsnSentry | null {
  try {
    const u = new URL(dsn)
    const projeto = u.pathname.replace(/^\/+/, '')
    if (u.protocol !== 'https:' || !u.username || !/^\d+$/.test(projeto)) return null
    return { chave: u.username, host: u.host, projeto }
  } catch {
    return null
  }
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
// CPF (com ou sem pontuação), CNPJ e telefone: 10+ dígitos seguidos, ainda que separados por . - / ( ) e espaço.
const CPF_CNPJ = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g
const TELEFONE = /(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g
// Tokens de portador, JWT e segredos longos em hex/base64: erro de autenticação costuma citá-los.
const SEGREDO = /\b(?:Bearer\s+[\w.~+/=-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{40,})\b/g

/** Tira e-mail, CPF/CNPJ, telefone e segredos de um texto. Aplicada a toda string que sai. */
export function limparTexto(s: string): string {
  return s
    .replace(SEGREDO, '[segredo]')
    .replace(EMAIL, '[email]')
    .replace(CPF_CNPJ, '[documento]')
    .replace(TELEFONE, '[telefone]')
    .slice(0, 2000)
}

/** Limpa recursivamente (profundidade e tamanho limitados): o detalhe do log é livre, o que sai não. */
export function limparValor(v: unknown, nivel = 0): unknown {
  if (typeof v === 'string') return limparTexto(v)
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v
  if (nivel >= 3 || v === undefined) return undefined
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => limparValor(x, nivel + 1))
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 30)) out[k] = limparValor(x, nivel + 1)
    return out
  }
  return undefined
}

function frames(stack: string | undefined) {
  if (!stack) return undefined
  const out: { function: string; filename: string; lineno?: number; colno?: number }[] = []
  for (const l of stack.split('\n').slice(1, 40)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(l)
    if (m) out.push({ function: m[1] ?? '?', filename: limparTexto(m[2]!).replace(/^file:\/\//, ''), lineno: Number(m[3]), colno: Number(m[4]) })
  }
  // O Sentry espera do mais antigo para o mais novo.
  return out.length ? { frames: out.reverse() } : undefined
}

export interface Ocorrencia {
  nivel: 'error' | 'warning'
  /** Nome do evento do log (`lead.falhou`, `request.failed`): é o que agrupa. */
  evento: string
  mensagem: string
  tags?: Record<string, string | number | boolean | undefined | null>
  detalhe?: Record<string, unknown>
  erro?: unknown
}

/** O evento no formato do Sentry. Pura: não lê ambiente nem rede, por isso o teste confere o que sai. */
export function montarEvento(o: Ocorrencia, amb: { ambiente: string; release?: string }, agora = new Date()) {
  const err = o.erro instanceof Error ? o.erro : undefined
  const tags: Record<string, string> = { evento: o.evento }
  for (const [k, v] of Object.entries(o.tags ?? {})) if (v !== undefined && v !== null && v !== '') tags[k] = limparTexto(String(v)).slice(0, 200)
  return {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: agora.getTime() / 1000,
    platform: 'node',
    level: o.nivel,
    environment: amb.ambiente,
    release: amb.release,
    // Agrupa pelo evento + código, e não pela mensagem: o motivo muda a cada ocorrência.
    fingerprint: [o.evento, tags.errorCode ?? tags.status ?? ''],
    message: err ? undefined : { formatted: limparTexto(`${o.evento}: ${o.mensagem}`) },
    exception: err ? { values: [{ type: err.name, value: limparTexto(err.message), stacktrace: frames(err.stack) }] } : undefined,
    tags,
    extra: limparValor(o.detalhe ?? {}),
    // Sem `user`, `request`, `server_name` e `sdk`: nada de pessoa nem de IP.
  }
}

const pendentes = new Set<Promise<unknown>>()

/** Espera os envios em voo. Chamada quando a função está para terminar: na Vercel, o que não terminou é perdido. */
export async function aguardarEnvios(ms = 1500) {
  if (!pendentes.size) return
  await Promise.race([Promise.allSettled([...pendentes]), new Promise((r) => setTimeout(r, ms))])
}

/** Fire-and-forget: reportar jamais pode atrasar nem derrubar a requisição. */
export function reportar(o: Ocorrencia, deps: { dsn?: string; fetch?: typeof globalThis.fetch } = {}): void {
  try {
    const dsn = lerDsn(deps.dsn ?? (useRuntimeConfig() as { sentryDsn?: string }).sentryDsn ?? '')
    if (!dsn) return
    const evento = montarEvento(o, { ambiente: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production', release: process.env.VERCEL_GIT_COMMIT_SHA })
    const corpo = [
      JSON.stringify({ event_id: evento.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(evento),
    ].join('\n')
    // Chamado `fetch` de propósito, como em gestao-captcha.ts. O host vem da DSN (não é literal), então o
    // guardrail de privacidade não o enxerga: a política cita o Sentry à mão e o teste confere isso.
    const fetch = deps.fetch ?? globalThis.fetch
    const p = fetch(`https://${dsn.host}/api/${dsn.projeto}/envelope/?sentry_key=${dsn.chave}&sentry_version=7`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body: corpo,
      signal: AbortSignal.timeout(3000),
    })
      .catch(() => undefined)
      .finally(() => pendentes.delete(p))
    pendentes.add(p)
  } catch {
    // Falha ao reportar é silenciosa de propósito: o log da Vercel já tem a linha.
  }
}
