import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isSessionExpiredError } from '~~/shared/utils/session-error'

let _client: SupabaseClient | null = null

/**
 * Client Supabase da ÁREA DO CLIENTE, carregado sob demanda.
 *
 * Import dinâmico pelo mesmo motivo do painel: sem ele o bundle do Supabase
 * entraria nas páginas públicas, que são justamente as que têm SEO.
 *
 * ⚠️ `storageKey` PRÓPRIO, diferente do `imob-admin-auth` do painel. Não é
 * preciosismo: as duas sessões convivem no mesmo navegador, e é o caso comum, não
 * o raro — a corretora vai abrir o portal para conferir o que a cliente dela
 * está vendo. Com a chave compartilhada, entrar num derrubaria o outro, e o
 * sintoma chegaria como "o painel me desloga sozinho".
 */
export async function getPortalSupabase(): Promise<SupabaseClient> {
  if (_client) return _client
  const { createClient } = await import('@supabase/supabase-js')
  const cfg = useRuntimeConfig()
  _client = createClient(cfg.public.supabaseUrl, cfg.public.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'imob-portal-auth',
    },
  })
  return _client
}

export function usePortalUser() {
  return useState<User | null>('portal-user', () => null)
}

/** O que o servidor respondeu sobre quem está logado. */
export interface PortalMe {
  name: string
  tenantName: string
}

/**
 * Resultado de `/api/portal/me`, cacheado por sessão.
 *
 * A autoridade sobre "esta pessoa pode usar o portal?" é o servidor — ele checa
 * o vínculo E o entitlement do tenant. O navegador não repete essa regra: ele
 * pergunta uma vez e guarda, do mesmo jeito que o painel faz com a associação.
 */
export function usePortalMe() {
  return useState<PortalMe | null>('portal-me', () => null)
}

export function usePortalAuth() {
  const user = usePortalUser()
  const me = usePortalMe()

  async function init() {
    if (!import.meta.client) return
    const sb = await getPortalSupabase()
    const { data } = await sb.auth.getSession()
    user.value = data.session?.user ?? null
    sb.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
      if (!session) me.value = null
    })
  }

  async function signIn(email: string, password: string) {
    const sb = await getPortalSupabase()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data } = await sb.auth.getSession()
    user.value = data.session?.user ?? null
    me.value = null
  }

  async function signOut() {
    const sb = await getPortalSupabase()
    // `scope: 'local'` pelo mesmo motivo documentado no painel: o padrão do
    // Supabase é 'global', que revoga os refresh tokens em TODOS os
    // dispositivos. Aqui a consequência é pior — o inquilino costuma usar
    // celular e computador, e sair num derrubaria o outro sem explicação.
    await sb.auth.signOut({ scope: 'local' })
    user.value = null
    me.value = null
  }

  async function accessToken(): Promise<string | null> {
    const sb = await getPortalSupabase()
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? null
  }

  /** Pergunta ao servidor quem é, e guarda. Devolve null se o acesso foi recusado. */
  async function loadMe(): Promise<PortalMe | null> {
    if (me.value) return me.value
    try {
      me.value = await portalFetch<PortalMe>('/api/portal/me')
      return me.value
    } catch {
      me.value = null
      return null
    }
  }

  async function resetPassword(email: string) {
    const sb = await getPortalSupabase()
    const redirectTo = `${window.location.origin}/area-cliente/definir-senha`
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    if (error) throw error
  }

  return { user, me, init, signIn, signOut, accessToken, loadMe, resetPassword }
}

/**
 * Baixa um documento do portal e entrega o arquivo ao navegador.
 *
 * Não dá para usar um `<a href>` simples: o endpoint exige o token no header, e
 * link não manda header. Então busca-se o arquivo autenticado, transforma-se em
 * blob e dispara-se o clique — o caminho normal para download protegido.
 *
 * `revokeObjectURL` no fim não é higiene opcional: sem ele o blob fica na
 * memória da aba até fechar, e o portal é usado no celular, onde a pessoa
 * costuma baixar vários recibos na mesma sessão.
 */
export async function baixarDocumento(documentId: string, nomeSugerido: string): Promise<void> {
  const blob = await portalFetch<Blob>(`/api/portal/documents/${documentId}/download`, {
    responseType: 'blob',
  })

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = nomeSugerido
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** $fetch para `/api/portal/*` com o token do cliente no header. */
export async function portalFetch<T>(url: string, opts: Record<string, unknown> = {}): Promise<T> {
  const { accessToken } = usePortalAuth()
  const token = await accessToken()
  const headers = { ...((opts.headers as Record<string, string>) || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    return (await $fetch(url, { ...opts, headers })) as T
  } catch (e) {
    if (isSessionExpiredError(e)) useSessionExpired('portal').flag()
    throw e
  }
}
