/**
 * Token de ACESSO do painel em modo `http`: só em memória (variável de módulo).
 *
 * Alternativa descartada: `localStorage`/`sessionStorage` — qualquer script na página (XSS, extensão)
 * leria o token e abriria o painel. Para o F5 não derrubar o login, o que persiste é o refresh token,
 * num cookie `HttpOnly` que o JavaScript não lê (`server/utils/gestao-cookie.ts`). Ao recarregar,
 * `renovarSessao()` troca o cookie por um token de acesso novo.
 *
 * O refresh token nunca passa por aqui: o navegador não renova sozinho (rotacionaria o token e
 * invalidaria o cookie); quem renova é o servidor, em `/api/gestao/auth/renovar`.
 *
 * O `session_id` do JWT atravessa a renovação, então o 2º fator cumprido continua valendo.
 */

let acesso: string | null = null
/** Epoch em segundos em que `acesso` vence (null = desconhecido). */
let venceEm: number | null = null
/** Renovação em andamento: chamadas simultâneas esperam a mesma, para não rotacionar o refresh duas vezes. */
let renovando: Promise<boolean> | null = null

/** Renova antes de vencer, com folga para a requisição não chegar com o token já expirado. */
const FOLGA_S = 60

export const tokenAtual = (): string | null => acesso

export async function guardarTokens(t: { accessToken: string; expiresAt?: number | null }): Promise<void> {
  acesso = t.accessToken
  venceEm = t.expiresAt ?? null
}

/** Troca o cookie de refresh por um token de acesso novo. `false` = sem sessão (nunca lança). */
export function renovarSessao(): Promise<boolean> {
  renovando ??= (async () => {
    try {
      const r = await $fetch<{ accessToken: string; expiresAt: number | null }>('/api/gestao/auth/renovar', { method: 'POST' })
      await guardarTokens(r)
      return true
    } catch {
      acesso = null
      venceEm = null
      return false
    } finally {
      renovando = null
    }
  })()
  return renovando
}

export async function tokenVigente(): Promise<string | null> {
  if (!acesso) return null
  if (venceEm !== null && venceEm - Date.now() / 1000 < FOLGA_S) await renovarSessao()
  return acesso
}

export async function limparTokens(): Promise<void> {
  const t = acesso
  acesso = null
  venceEm = null
  // Apaga o cookie e revoga a sessão no servidor; falha de rede não pode impedir o "Sair" local.
  await $fetch('/api/gestao/auth/sair', { method: 'POST', headers: t ? { authorization: `Bearer ${t}` } : {} }).catch(() => {})
}
