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
  // deixa passar (o limite é anti-abuso, não um controle de acesso). Mas fica
  // registrado — senão a proteção pode estar desligada há semanas sem ninguém ver.
  if (error) {
    logWarn('ratelimit.check_failed', {
      table: opts.table,
      tenant: opts.tenantId,
      reason: error.message,
    })
    return
  }
  if ((count ?? 0) >= max) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Muitas mensagens enviadas. Tente novamente em alguns minutos.',
    })
  }
}

/**
 * Limite de downloads do portal, contado na própria trilha de acesso.
 *
 * Reaproveita `portal_document_access`: a tabela que já registra cada download
 * é também o contador, então não existe estado paralelo para divergir. Mesmo
 * motivo do limite de formulário estar no banco — na Vercel cada requisição
 * pode cair numa instância diferente, e um Map local não limita nada.
 *
 * O alvo aqui é diferente do formulário público. Não é spam: é alguém com
 * sessão válida varrendo ids de documento para descobrir o que existe. A
 * varredura é barrada de qualquer jeito (a recusa é 404 e não vaza nada), mas
 * sem limite ela roda de graça e enche a trilha de ruído.
 *
 * Precisa de service role: o cliente não tem policy de leitura nesta tabela, e
 * não deve ter — quem lê a trilha é a imobiliária.
 */
export async function assertDownloadRateLimit(
  service: Client,
  opts: {
    tenantId: string
    portalUserId: string
    /** Janela considerada. Padrão: 5 min. */
    windowMs?: number
    /** Downloads tolerados na janela. Padrão: 40. */
    max?: number
  },
): Promise<void> {
  const windowMs = opts.windowMs ?? 5 * 60 * 1000
  // Generoso de propósito: uma pessoa organizada baixando o ano inteiro de
  // recibos para o imposto de renda faz uns 12 downloads seguidos, e travar
  // ISSO é transformar proteção em defeito. O número corta varredura
  // automatizada, não uso atento.
  const max = opts.max ?? 40
  const since = new Date(Date.now() - windowMs).toISOString()

  const { count, error } = await service
    .from('portal_document_access')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', opts.tenantId)
    .eq('portal_user_id', opts.portalUserId)
    .gte('created_at', since)

  if (error) {
    // Mesma escolha do limite de formulário: na dúvida deixa passar, mas grita.
    // Negar o documento de quem tem direito a ele é pior que perder uma trava
    // anti-abuso — e o acesso em si continua barrado pelas DUAS barreiras.
    logWarn('ratelimit.check_failed', {
      table: 'portal_document_access',
      tenant: opts.tenantId,
      reason: error.message,
    })
    return
  }

  if ((count ?? 0) >= max) {
    logWarn('portal.download_rate_limited', {
      tenant: opts.tenantId,
      portalUserId: opts.portalUserId,
      count,
    })
    throw createError({
      statusCode: 429,
      statusMessage: 'Muitos downloads seguidos. Tente novamente em alguns minutos.',
    })
  }
}

/** Corta e valida o tamanho de um campo de texto vindo de formulário público. */
export function assertMaxLength(value: string, max: number, label: string): void {
  if (value.length > max) {
    throw createError({ statusCode: 422, statusMessage: `${label} excede ${max} caracteres.` })
  }
}
