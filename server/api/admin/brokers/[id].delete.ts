import { deleteBroker } from '~~/server/repositories/broker.repository'

/** Exclui um corretor. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  await deleteBroker(client, tenant.id, id)
  return { ok: true }
})
