import { listActiveProperties } from '~~/server/repositories/property.repository'

/** Lista completa de imóveis publicados do tenant (cache de 10 min). */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  return cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
    listActiveProperties(publicSupabase(), tenant.id),
  )
})
