import type { LeadUpdateInput } from '~~/shared/models/lead'
import { LEAD_LOST_REASON_LABELS, LEAD_STAGE_LABELS } from '~~/shared/models/lead'
import { eventosDaMudanca } from '~~/shared/models/lead-activity'
import { getLeadState, updateLead } from '~~/server/repositories/lead.repository'
import { corretorDoTenant, registrarEventos } from '~~/server/utils/lead-crm'

/**
 * Atualiza um lead: mover no funil, trocar o responsável.
 *
 * Os eventos de etapa e de atribuição nascem AQUI, comparando antes e depois,
 * e não no navegador: registro que o cliente pode esquecer de mandar não é
 * histórico (spec 2026-09-25-crm-e-cobranca, A1).
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<LeadUpdateInput>(event)
  assertLeadUpdateInput(body)

  const antes = await getLeadState(client, tenant.id, id)
  if (!antes) throw createError({ statusCode: 404, statusMessage: 'Contato não encontrado.' })

  const corretor = body.brokerId ? await corretorDoTenant(client, tenant.id, body.brokerId) : null

  const lead = await updateLead(client, tenant.id, id, body, user.id)
  const eventos = eventosDaMudanca(
    antes,
    { stage: lead.stage, brokerId: lead.brokerId, lostReason: lead.lostReason },
    (bid) => (corretor?.id === bid ? corretor.name : null),
    { stage: LEAD_STAGE_LABELS, lostReason: LEAD_LOST_REASON_LABELS },
  )
  await registrarEventos(client, tenant, id, eventos, user.id)
  return lead
})
