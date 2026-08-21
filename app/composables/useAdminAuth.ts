import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isSessionExpiredError } from '~~/shared/utils/session-error'

let _client: SupabaseClient | null = null
const _inflightAdminGet = new Map<string, Promise<unknown>>()

/**
 * Client Supabase do painel, carregado SOB DEMANDA (import dinâmico) apenas nas
 * páginas /admin — assim o bundle do Supabase não entra nas páginas públicas.
 */
export async function getAdminSupabase(): Promise<SupabaseClient> {
  if (_client) return _client
  const { createClient } = await import('@supabase/supabase-js')
  const cfg = useRuntimeConfig()
  _client = createClient(cfg.public.supabaseUrl, cfg.public.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'imob-admin-auth',
    },
  })
  return _client
}

export function useAuthUser() {
  return useState<User | null>('admin-user', () => null)
}

/**
 * O usuário logado é membro do tenant informado? Espelha, no client, o
 * `requireTenantMember` do servidor: estar autenticado não basta, o painel é
 * por-tenant (subdomínio). A policy `tenant_members_self_read` deixa o usuário
 * ler a própria associação, então esta query só retorna linha se ele for membro.
 */
export async function isMemberOfTenant(tenantId: string): Promise<boolean> {
  const sb = await getAdminSupabase()
  const { data: sessionData } = await sb.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) return false

  // Associação não muda durante a sessão: cacheia por (tenant, usuário) pra não
  // reconsultar o banco a cada navegação interna do painel (o middleware roda em
  // toda troca de tela). Servidor e RLS seguem validando em toda escrita.
  const cache = useState<Record<string, boolean>>('admin-membership', () => ({}))
  const key = `${tenantId}:${uid}`
  if (cache.value[key] !== undefined) return cache.value[key]

  const { data, error } = await sb
    .from('tenant_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', uid)
    .maybeSingle()
  if (error) return false // erro transitório não vira "sem acesso" cacheado
  const ok = !!data
  cache.value[key] = ok
  return ok
}

export function useAdminAuth() {
  const user = useAuthUser()

  async function init() {
    if (!import.meta.client) return
    const sb = await getAdminSupabase()
    const { data } = await sb.auth.getSession()
    user.value = data.session?.user ?? null
    sb.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
    })
  }

  async function signIn(email: string, password: string) {
    const sb = await getAdminSupabase()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data } = await sb.auth.getSession()
    user.value = data.session?.user ?? null
  }

  async function signOut() {
    const sb = await getAdminSupabase()
    // `scope: 'local'` NÃO é opcional aqui. O padrão do Supabase é 'global', que
    // revoga os refresh tokens do usuário em TODOS os dispositivos — não só
    // nesta aba.
    //
    // Isso derrubou uma cliente em produção: entramos na conta dela em outra
    // máquina para dar suporte e, ao sair, a sessão que ela tinha aberta no
    // próprio computador morreu junto. Ela só descobriu na hora de salvar um
    // imóvel, com "sessão inválida ou expirada" e nenhuma pista do motivo.
    //
    // Com várias pessoas por imobiliária e cada uma usando celular e
    // computador, o padrão global significa que sair num aparelho derruba o
    // outro. Sair é sair daqui.
    await sb.auth.signOut({ scope: 'local' })
    user.value = null
  }

  async function accessToken(): Promise<string | null> {
    const sb = await getAdminSupabase()
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? null
  }

  return { user, init, signIn, signOut, accessToken }
}

/** $fetch para os endpoints /api/admin/* com o token do usuário no header. */
export async function adminFetch<T>(url: string, opts: Record<string, unknown> = {}): Promise<T> {
  const { accessToken } = useAdminAuth()
  const token = await accessToken()
  const headers = { ...((opts.headers as Record<string, string>) || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  const method = String((opts.method as string | undefined) ?? 'GET').toUpperCase()
  const run = async (): Promise<T> => {
    try {
      return (await $fetch(url, { ...opts, headers })) as T
    } catch (e) {
      // Marca a sessão como caída e RELANÇA: quem chamou continua mostrando o
      // próprio erro na tela onde está. O aviso global explica a causa; o erro
      // local diz o que não aconteceu.
      if (isSessionExpiredError(e)) useSessionExpired().flag()
      throw e
    }
  }

  // Evita chamadas GET idênticas em paralelo (efeito típico na troca de abas).
  if (method === 'GET') {
    const key = `${method}:${url}:${headers.Authorization ?? ''}`
    const pending = _inflightAdminGet.get(key) as Promise<T> | undefined
    if (pending) return pending
    const req = run() as Promise<unknown>
    _inflightAdminGet.set(key, req)
    try {
      return (await req) as T
    } finally {
      _inflightAdminGet.delete(key)
    }
  }

  return run()
}
