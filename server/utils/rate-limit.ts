import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'

type Client = SupabaseClient<Database>

/**
 * Limite de envios para formulários públicos, contado NO BANCO.
 *
 * Contador em memória não serve aqui: na Vercel cada requisição pode cair numa
 * instância diferente de lambda, então um Map local só limitaria quem tivesse o
 * azar de repetir a mesma instância (mesmo motivo pelo qual o cache tem TTL
 * curto em vez de confiar em invalidação).
 *
 * Uso — antes de gravar:
 *   await assertSubmitRateLimit(client, {
 *     table: 'leads', tenantId, column: 'phone', value: phone,
 *   })
 */
export async function assertSubmitRateLimit(
  client: Client,
  opts: {
    table: 'leads'
    tenantId: string
    /** Coluna que identifica quem enviou (ex.: telefone). */
    column: string
    value: string
    /** Janela de tempo considerada. Padrão: 10 min. */
    windowMs?: number
    /** Quantos envios são tolerados na janela. Padrão: 3. */
    max?: number
  },
): Promise<void> {
  const windowMs = opts.windowMs ?? 10 * 60 * 1000
  const max = opts.max ?? 3
  const since = new Date(Date.now() - windowMs).toISOString()

  const { count, error } = await client
    .from(opts.table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', opts.tenantId)
    .eq(opts.column, opts.value)
    .gte('created_at', since)

  // Falha na checagem não pode derrubar o formulário do cliente: na dúvida,
  // deixa passar (o limite é anti-abuso, não um controle de acesso).
  if (error) return
  if ((count ?? 0) >= max) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Muitas mensagens enviadas. Tente novamente em alguns minutos.',
    })
  }
}

/** Corta e valida o tamanho de um campo de texto vindo de formulário público. */
export function assertMaxLength(value: string, max: number, label: string): void {
  if (value.length > max) {
    throw createError({ statusCode: 422, statusMessage: `${label} excede ${max} caracteres.` })
  }
}
