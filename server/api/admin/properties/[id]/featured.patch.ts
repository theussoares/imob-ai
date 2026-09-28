import { updatePropertyFeatured } from '~~/server/repositories/property.repository'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ featured: boolean }>(event)

  if (typeof body?.featured !== 'boolean') {
    throw createError({ statusCode: 422, statusMessage: 'featured deve ser booleano.' })
  }

  const property = await updatePropertyFeatured(serviceSupabase(), tenant.id, id, body.featured)
  await invalidateTenantCache(tenant.id)
  return property
})
