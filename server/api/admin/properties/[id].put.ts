import type { PropertyInput } from '~~/shared/models/property'
import { updateProperty } from '~~/server/repositories/property.repository'

/** Atualiza um imóvel. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  const body = await readBody<PropertyInput>(event)
  assertPropertyInput(body)
  const property = await updateProperty(client, tenant.id, id, body)
  await invalidateTenantCache(tenant.id)
  return property
})
