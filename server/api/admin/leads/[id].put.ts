import type { LeadUpdateInput } from '~~/shared/models/lead'
import { updateLead } from '~~/server/repositories/lead.repository'

/** Atualiza um lead: mover no funil, anotar histórico, agendar retorno. */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  const body = await readBody<LeadUpdateInput>(event)
  assertLeadUpdateInput(body)
  return updateLead(client, tenant.id, id, body, user.id)
})
