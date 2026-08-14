import { deleteBroker } from '~~/server/repositories/broker.repository'

/** Exclui um corretor. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  await deleteBroker(client, tenant.id, id)
  return { ok: true }
})
