import { deleteProperty } from '~~/server/repositories/property.repository'

/** Exclui um imóvel. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  await deleteProperty(client, tenant.id, id)
  await invalidateTenantCache(tenant.id)
  return { ok: true }
})
