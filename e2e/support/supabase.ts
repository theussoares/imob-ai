import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client de service role para o provisionamento.
 *
 * ⚠️ Este é o MESMO projeto Supabase de produção — dev e produção dividem
 * `eixzfjmmcocuxnprqskf`. Tudo aqui escreve no banco dos clientes reais, e é por
 * isso que cada função abaixo é escopada por um tenant `e2e-*` e nunca por id
 * solto. Um `delete` sem `where` de slug aqui apaga cliente de verdade.
 */
export function service(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env para o E2E rodar.',
    )
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
