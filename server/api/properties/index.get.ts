import { listActivePropertyCards } from '~~/server/repositories/property.repository'

/** Cards dos imóveis publicados do tenant (payload enxuto, sem description/features). */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  return cached(tenantCacheKey(tenant.id, 'properties:cards'), () =>
    listActivePropertyCards(serviceSupabase(), tenant.id),
  )
})
