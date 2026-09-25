import { listLeadEvents } from '~~/server/repositories/lead-activity.repository'

/** Linha do tempo do lead. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  return listLeadEvents(client, tenant.id, id)
})
