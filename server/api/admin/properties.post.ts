import type { PropertyInput } from '~~/shared/models/property'
import { createProperty } from '~~/server/repositories/property.repository'

/** Cria um imóvel. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<PropertyInput>(event)
  assertPropertyInput(body)
  const property = await createProperty(client, tenant.id, body)
  await invalidateTenantCache(tenant.id)
  return property
})
