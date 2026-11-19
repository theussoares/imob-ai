import type { H3Event } from 'h3'

/**
 * Captcha do login e do aceite de convite do /gestao (Cloudflare Turnstile).
 *
 * O token que a tela manda só vale depois de o SERVIDOR perguntar à Cloudflare (`siteverify`) com a secret
 * key: conferir só no navegador é o mesmo que não ter captcha. A tela (`GestaoCaptcha.vue`) só renderiza o
 * widget real quando existe a site key; sem ela é o desafio simulado do demo, e sem a secret aqui o servidor
 * não verifica nada (o limite de tentativas por IP e por conta continua valendo, ver `exigirLimiteLogin`).
 * Por isso as duas chaves entram juntas: site key sem secret deixaria o widget enfeitando um login aberto.
 *
 * ⚠️ Cloudflare fora do ar NÃO derruba o login: erro de rede ou resposta inesperada deixa passar e registra em
 * log. A alternativa (falhar fechado) trancaria a equipe da imobiliária para fora por um problema que não é
 * dela, e o login segue protegido por senha, código de e-mail e limite de tentativas. Token RECUSADO pela
 * Cloudflare, esse sim barra.
 */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const ERRO_CAPTCHA = 'Confirme que você não é um robô.'
const TIMEOUT_MS = 5000

export type ResultadoCaptcha = 'ok' | 'invalido' | 'indisponivel'

/** Pura em relação ao H3: recebe o `fetch` para o teste não depender da rede. */
export async function verificarCaptcha(
  secret: string,
  token: string,
  ip: string | null,
  deps: { fetch?: typeof globalThis.fetch } = {},
): Promise<ResultadoCaptcha> {
  // Chamado `fetch` de propósito: `privacidade-guardrail.test.ts` procura `fetch('https://…')` para vigiar os
  // serviços externos que o servidor chama.
  const fetch = deps.fetch ?? globalThis.fetch
  if (!token || token.length > 2048) return 'invalido'
  try {
    const corpo = new URLSearchParams({ secret, response: token })
    if (ip) corpo.set('remoteip', ip)
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!r.ok) return 'indisponivel'
    const j = (await r.json()) as { success?: unknown }
    return j.success === true ? 'ok' : 'invalido'
  } catch {
    return 'indisponivel'
  }
}

export const captchaLigado = () => !!useRuntimeConfig().turnstileSecret

/** Lança 422 (`motivo: 'captcha'`) quando o token é recusado; sem secret configurada, não faz nada. */
export async function exigirCaptcha(event: H3Event, token: unknown): Promise<void> {
  const secret = String(useRuntimeConfig().turnstileSecret || '')
  if (!secret) return
  const ip = clientIpFrom((name) => getHeader(event, name))
  const r = await verificarCaptcha(secret, typeof token === 'string' ? token : '', ip)
  if (r === 'indisponivel') {
    logWarn('gestao.captcha_indisponivel', {})
    return
  }
  if (r === 'invalido') throw createError({ statusCode: 422, statusMessage: ERRO_CAPTCHA, data: { motivo: 'captcha' } })
}
