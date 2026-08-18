import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'

let _publicClient: SupabaseClient<Database> | null = null
let _serviceClient: SupabaseClient<Database> | null = null

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

/**
 * Client com a service_role key — IGNORA todas as policies de RLS.
 *
 * Existe para ESCRITAS PÚBLICAS (formulários do site). A anon key vai no HTML de
 * toda página, então deixar o papel público escrever direto numa tabela permite
 * que qualquer um pule a validação da API e grave o que quiser. O padrão passa a
 * ser: a tabela não aceita escrita do anon, e o servidor grava por aqui, depois
 * de validar.
 *
 * REGRAS:
 * - só em `server/` (nunca em código que vai pro navegador);
 * - a chave fica em runtimeConfig privado, NUNCA em `public`;
 * - sempre filtrar por tenant na query: aqui não há RLS pra te salvar.
 */
export function serviceSupabase(): SupabaseClient<Database> {
  if (_serviceClient) return _serviceClient
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl
  const key = config.supabaseServiceKey
  if (!url || !key) {
    // Config faltando derruba toda escrita pública (formulários). Precisa gritar
    // no log — o sintoma que chega é "o formulário parou", sem causa aparente.
    logError('config.service_key_missing', { hasUrl: !!url })
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase não configurado (SUPABASE_SERVICE_ROLE_KEY ausente).',
    })
  }
  _serviceClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _serviceClient
}
