import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'

let _publicClient: SupabaseClient<Database> | null = null

/**
 * Client Supabase público (anon key). Usado para LEITURAS públicas —
 * as policies de RLS liberam apenas dados ativos. Nunca faz escrita privilegiada.
 */
export function publicSupabase(): SupabaseClient<Database> {
  if (_publicClient) return _publicClient
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl
  const key = config.public.supabaseKey
  if (!url || !key) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase não configurado (SUPABASE_URL / SUPABASE_KEY).' })
  }
  _publicClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _publicClient
}
