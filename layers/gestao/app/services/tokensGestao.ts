import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tokens do painel em modo `http`: SÓ em memória (variável de módulo).
 *
 * Alternativa descartada: `localStorage`/`sessionStorage` — qualquer script na página (XSS, extensão)
 * leria o token e, com ele, o painel inteiro. O preço é conhecido: recarregar a página pede
 * e-mail, senha e código de novo. A renovação (refresh token) fica com o client do Supabase,
 * criado com `persistSession: false` (armazenamento em memória do próprio client) e uma
 * `storageKey` própria, para nunca esbarrar na sessão do /admin.
 *
 * O `session_id` do JWT atravessa o refresh, então o 2º fator cumprido continua valendo.
 */

let acesso: string | null = null
let cliente: SupabaseClient | null = null

export const tokenAtual = (): string | null => acesso

export interface ConfigSupabase {
  url: string
  key: string
}

export async function guardarTokens(t: { accessToken: string; refreshToken: string }, cfg: ConfigSupabase): Promise<void> {
  acesso = t.accessToken
  if (!cliente) {
    const { createClient } = await import('@supabase/supabase-js')
    cliente = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'imob-gestao-auth' },
    })
    // O client renova sozinho perto de expirar; aqui só espelhamos o token novo na memória.
    cliente.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao?.access_token) acesso = sessao.access_token
    })
  }
  await cliente.auth.setSession({ access_token: t.accessToken, refresh_token: t.refreshToken })
}

/** Renova antes de uma chamada se o token está a menos de 30 s de vencer. */
export async function tokenVigente(): Promise<string | null> {
  if (!acesso) return null
  if (cliente) {
    const { data } = await cliente.auth.getSession()
    if (data.session?.access_token) acesso = data.session.access_token
  }
  return acesso
}

export async function limparTokens(): Promise<void> {
  acesso = null
  const c = cliente
  cliente = null
  // `local`: encerra esta sessão no servidor sem derrubar as do mesmo usuário em outros aparelhos.
  if (c) await c.auth.signOut({ scope: 'local' }).catch(() => {})
}
