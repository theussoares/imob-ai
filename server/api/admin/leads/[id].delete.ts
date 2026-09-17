import { deleteLead } from '~~/server/repositories/lead.repository'

/** Exclui um lead. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  await deleteLead(client, tenant.id, id)
  return { ok: true }
})
