import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isSessionExpiredError } from '~~/shared/utils/session-error'
import { clearInflight, dedupeInflight, stableKeyPart } from '~~/shared/utils/inflight'

let _client: SupabaseClient | null = null

/**
 * Client Supabase do PORTAL — o do cliente da imobiliária, não o do painel.
 *
 * ⚠️ `storageKey` próprio, e isso não é organização: é o que impede uma sessão
 * de derrubar a outra. O painel usa `imob-admin-auth`; compartilhar a chave
 * faria as duas sessões disputarem o mesmo slot do localStorage no mesmo
 * navegador. O cenário não é hipotético — é a corretora abrindo o portal para
 * conferir como o cliente vê, e perdendo o login do painel ao fazer isso.
 *
 * Carregado sob demanda (import dinâmico) pelo mesmo motivo do painel: o bundle
 * do Supabase não pode entrar nas páginas públicas, que são as que têm SEO.
 */
export async function getPortalSupabase(): Promise<SupabaseClient> {
  if (_client) return _client
  const { createClient } = await import('@supabase/supabase-js')
  const cfg = useRuntimeConfig()
  _client = createClient(cfg.public.supabaseUrl, cfg.public.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // O link de convite traz o token na URL e é a página `definir-senha` que
      // o consome, explicitamente. Detectar aqui faria a sessão nascer em
      // qualquer rota onde o link caísse.
      detectSessionInUrl: false,
      storageKey: 'imob-portal-auth',
    },
  })
  return _client
}

export function usePortalUser() {
  return useState<User | null>('portal-user', () => null)
}

/** O motivo pelo qual a última tentativa de entrar não deu certo. */
export type PortalAccessDenial = 'nao-e-cliente' | 'desativado' | null

/**
 * Esta conta é cliente ATIVO deste tenant?
 *
 * Espelha o `requirePortalUser` do servidor. A policy `portal_users_read` deixa
 * a pessoa ler só a própria linha, então a consulta já é a checagem — não uma
 * busca que precise ser conferida depois.
 *
 * Devolve o MOTIVO, não um booleano, porque os dois casos exigem frases
 * diferentes na tela: quem é do painel precisa saber que errou de porta, e quem
 * foi desativado precisa saber que deve falar com a imobiliária. "Não foi
 * possível entrar" faria as duas pessoas tentarem a senha de novo para sempre.
 */
export async function portalAccessDenial(tenantId: string): Promise<PortalAccessDenial> {
  const sb = await getPortalSupabase()
  const { data: sessionData } = await sb.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) return 'nao-e-cliente'

  const { data, error } = await sb
    .from('portal_users')
    .select('id, active')
    .eq('tenant_id', tenantId)
    .eq('user_id', uid)
    .maybeSingle()

  // Erro transitório não vira "sem acesso": deslogar alguém por causa de uma
  // falha de rede é pior que deixar o servidor recusar na próxima chamada, que
  // é o que vai acontecer de qualquer forma.
  if (error) return null
  if (!data) return 'nao-e-cliente'
  if (!data.active) return 'desativado'
  return null
}

export function usePortalAuth() {
  const user = usePortalUser()

  async function init() {
    if (!import.meta.client) return
    const sb = await getPortalSupabase()
    const { data } = await sb.auth.getSession()
    user.value = data.session?.user ?? null
    sb.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
    })
  }

  async function signIn(email: string, password: string) {
    const sb = await getPortalSupabase()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data } = await sb.auth.getSession()
    user.value = data.session?.user ?? null
  }

  async function signOut() {
    const sb = await getPortalSupabase()
    // `scope: 'local'` pelo mesmo motivo documentado no painel: o padrão do
    // Supabase revoga os refresh tokens em TODOS os dispositivos. Aqui seria
    // ainda pior — o inquilino sai no computador e cai o acesso do celular,
    // sem nenhuma pista do motivo.
    await sb.auth.signOut({ scope: 'local' })
    user.value = null
  }

  async function accessToken(): Promise<string | null> {
    const sb = await getPortalSupabase()
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? null
  }

  return { user, init, signIn, signOut, accessToken }
}

/** $fetch para os endpoints /api/portal/* com o token do cliente no header. */
export async function portalFetch<T>(url: string, opts: Record<string, unknown> = {}): Promise<T> {
  const { accessToken } = usePortalAuth()
  const token = await accessToken()
  const headers = { ...((opts.headers as Record<string, string>) || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  const method = String((opts.method as string | undefined) ?? 'GET').toUpperCase()
  const run = async (): Promise<T> => {
    try {
      return (await $fetch(url, { ...opts, headers })) as T
    } catch (e) {
      if (isSessionExpiredError(e)) usePortalSessionExpired().flag()
      throw e
    }
  }

  if (method === 'GET') {
    const key = `${method}:${url}:${headers.Authorization ?? ''}:${stableOpts(opts)}`
    return dedupeInflight(key, run)
  }

  try {
    return await run()
  } finally {
    clearInflight()
  }
}

function stableOpts(opts: Record<string, unknown>): string {
  const { headers: _headers, ...resto } = opts
  return Object.keys(resto).length ? stableKeyPart(resto) : ''
}
