import type { SupabaseClient, User } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

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
    await sb.auth.signOut()
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
  return (await $fetch(url, { ...opts, headers })) as T
}
