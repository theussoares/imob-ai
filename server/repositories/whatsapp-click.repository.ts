import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { WhatsappClick, WhatsappClickDestination, WhatsappClickOrigin } from '~~/shared/models/whatsapp-click'
import { toWhatsappClickModel, type ClickEmbeds } from '~~/server/mappers/whatsapp-click.mapper'

type Client = SupabaseClient<Database>

const MIN = 60 * 1000

/** Toque repetido: mesmo IP, mesmo imóvel, dentro desta janela, é a mesma pessoa. */
export const JANELA_REPETICAO_MS = 30 * MIN
/** Acima disto, do mesmo IP em 10 min, não é gente — é script. */
export const MAX_CLIQUES_POR_IP = 20
const JANELA_EXCESSO_MS = 10 * MIN

export interface RecordClickArgs {
  tenantId: string
  propertyId: string | null
  brokerId: string | null
  origin: WhatsappClickOrigin
  ipHash: string | null
}

export type RecordClickResult = 'gravado' | 'repetido' | 'excesso'

/**
 * Grava o clique, a menos que seja toque repetido ou enxurrada.
 *
 * Service role: `whatsapp_clicks` não aceita escrita pública (0046), e este é o
 * único caminho até ela. Todo `where` leva `tenant_id` — aqui não há RLS.
 *
 * As duas checagens falham para o lado ABERTO (grava mesmo sem conseguir
 * contar): o clique é o dado, a deduplicação é refinamento. Mesmo raciocínio
 * de `assertSubmitRateLimit`.
 *
 * Sem `ipHash` não há como deduplicar, e grava direto. Acontece sem
 * `RATE_LIMIT_IP_SALT`, e aí `requestIpHash` já registrou o aviso.
 */
export async function recordWhatsappClick(
  service: Client,
  args: RecordClickArgs,
  agora = Date.now(),
): Promise<RecordClickResult> {
  if (args.ipHash) {
    const excesso = await service
      .from('whatsapp_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', args.tenantId)
      .eq('ip_hash', args.ipHash)
      .gte('created_at', new Date(agora - JANELA_EXCESSO_MS).toISOString())
    if (!excesso.error && (excesso.count ?? 0) >= MAX_CLIQUES_POR_IP) return 'excesso'

    const repetido = service
      .from('whatsapp_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', args.tenantId)
      .eq('ip_hash', args.ipHash)
      .gte('created_at', new Date(agora - JANELA_REPETICAO_MS).toISOString())
    const { count, error } = await (args.propertyId
      ? repetido.eq('property_id', args.propertyId)
      : repetido.is('property_id', null))
    if (!error && (count ?? 0) > 0) return 'repetido'
  }

  const destination: WhatsappClickDestination = args.brokerId ? 'corretor' : 'imobiliaria'
  const { error } = await service.from('whatsapp_clicks').insert({
    tenant_id: args.tenantId,
    property_id: args.propertyId,
    broker_id: args.brokerId,
    destination,
    origin: args.origin,
    ip_hash: args.ipHash,
  })
  if (error) throw error
  return 'gravado'
}

/**
 * Cliques recentes deste tenant, para o painel.
 *
 * Colunas explícitas: `ip_hash` fica fora. O painel não tem o que fazer com
 * ele, e o que não sai da query não vaza por descuido do mapper.
 */
export async function listRecentWhatsappClicks(
  client: Client,
  tenantId: string,
  desde: string,
): Promise<WhatsappClick[]> {
  const { data, error } = await client
    .from('whatsapp_clicks')
    .select('id, created_at, destination, origin, lead_id, properties(id, code, title, purpose), brokers(id, name)')
    .eq('tenant_id', tenantId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((row) => {
    const { properties, brokers, ...rest } = row as typeof row & ClickEmbeds
    return toWhatsappClickModel(rest, { properties, brokers })
  })
}

/**
 * O que o cadastro manual herda de um clique: imóvel e corretor.
 *
 * É por aqui — e não por um `propertyId` no body — que o lead ganha imóvel.
 * O id do clique passa pelo filtro de tenant; um `propertyId` do body seria
 * id de imóvel de outra imobiliária esperando para ser gravado.
 */
export async function getClickForConversion(
  client: Client,
  tenantId: string,
  clickId: string,
): Promise<{ propertyId: string | null; brokerId: string | null; leadId: string | null } | null> {
  const { data, error } = await client
    .from('whatsapp_clicks')
    .select('property_id, broker_id, lead_id')
    .eq('tenant_id', tenantId)
    .eq('id', clickId)
    .maybeSingle()
  if (error) throw error
  return data ? { propertyId: data.property_id, brokerId: data.broker_id, leadId: data.lead_id } : null
}

/**
 * Marca o clique como convertido, só se ele ainda estiver livre.
 *
 * O `is('lead_id', null)` é a trava de verdade contra dois atendentes
 * convertendo o mesmo clique: a checagem antes do insert tem uma janela entre
 * ler e gravar, e os dois passariam por ela. Aqui o banco decide quem chegou
 * primeiro. `false` = perdeu a corrida.
 */
export async function markClickConverted(
  client: Client,
  tenantId: string,
  clickId: string,
  leadId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('whatsapp_clicks')
    .update({ lead_id: leadId })
    .eq('tenant_id', tenantId)
    .eq('id', clickId)
    .is('lead_id', null)
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/**
 * Retenção: apaga cliques antigos de TODOS os tenants. Chamado só pelo cron.
 *
 * `ip_hash` é pseudônimo de visitante; guardar sem prazo é guardar sem motivo.
 * 90 dias cobrem com folga a pergunta "de onde veio este cliente?".
 */
export async function purgeOldWhatsappClicks(service: Client, antesDe: string): Promise<void> {
  const { error } = await service.from('whatsapp_clicks').delete().lt('created_at', antesDe)
  if (error) throw error
}
