import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { NewLeadEvent } from '~~/shared/models/lead-activity'
import { insertLeadEvents } from '~~/server/repositories/lead-activity.repository'
import { getBroker } from '~~/server/repositories/broker.repository'
import { assignLeadBroker, nextRoletaBroker } from '~~/server/repositories/lead.repository'

type Client = SupabaseClient<Database>

/**
 * Grava eventos de sistema depois que a mudança JÁ foi salva.
 *
 * Não lança: a etapa já mudou no banco, e devolver erro faria o corretor
 * repetir a ação — gerando a mudança duas vezes. O custo de engolir é um buraco
 * no histórico, que por isso vai para o log como erro (sem nome nem telefone:
 * dado de terceiro, ver log.ts).
 */
export async function registrarEventos(
  client: Client,
  tenant: { id: string; slug: string },
  leadId: string,
  eventos: NewLeadEvent[],
  userId: string | null,
): Promise<void> {
  if (!eventos.length) return
  try {
    await insertLeadEvents(client, tenant.id, leadId, eventos, userId)
  } catch (e) {
    logError('lead_evento.nao_gravado', { tenant: tenant.slug, kinds: eventos.map((x) => x.kind).join(','), reason: errMessage(e) })
  }
}

/**
 * Confere que o corretor é desta imobiliária e devolve o nome.
 *
 * `leads.broker_id` tem FK simples (0016), não composta: sem esta checagem, um
 * membro poderia pôr como responsável o corretor de OUTRA imobiliária cujo id
 * descobrisse — e o nome dele apareceria no histórico daqui.
 */
export async function corretorDoTenant(client: Client, tenantId: string, brokerId: string): Promise<{ id: string; name: string }> {
  const b = await getBroker(client, tenantId, brokerId)
  if (!b) throw createError({ statusCode: 422, statusMessage: 'Corretor não encontrado.' })
  return { id: b.id, name: b.name }
}

/**
 * Entrega um lead recém-chegado pelo site ao próximo corretor da roleta.
 *
 * Devolve o corretor (para o aviso de lead ir também para ele) ou null quando
 * a imobiliária não usa roleta, não há ninguém nela, ou algo falhou. Nunca
 * lança: o lead já está gravado, e o visitante não pode ver "não foi possível
 * registrar seu contato" por causa da distribuição interna.
 */
export async function distribuirPelaRoleta(
  service: Client,
  tenant: { id: string; slug: string },
  leadId: string,
): Promise<{ id: string; name: string; email: string | null } | null> {
  try {
    const brokerId = await nextRoletaBroker(service, tenant.id)
    if (!brokerId) return null
    await assignLeadBroker(service, tenant.id, leadId, brokerId)
    const b = await getBroker(service, tenant.id, brokerId)
    await registrarEventos(
      service,
      tenant,
      leadId,
      [{ kind: 'atribuicao', body: `Atribuído a ${b?.name ?? 'corretor'} pela roleta`, meta: { brokerId, via: 'roleta' } }],
      null,
    )
    return b ? { id: b.id, name: b.name, email: b.email } : null
  } catch (e) {
    logError('lead_roleta.falhou', { tenant: tenant.slug, reason: errMessage(e) })
    return null
  }
}
