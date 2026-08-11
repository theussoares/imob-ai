import { listActiveProperties } from '~~/server/repositories/property.repository'

/** Detalhe de um imóvel por código — reutiliza a lista cacheada (sem query extra). */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const code = getRouterParam(event, 'code')
  if (!code) throw createError({ statusCode: 400, statusMessage: 'Código inválido.' })

  const list = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
    listActiveProperties(publicSupabase(), tenant.id),
  )
  const property = list.find((p) => p.code.toLowerCase() === code.toLowerCase())
  if (!property) throw createError({ statusCode: 404, statusMessage: 'Imóvel não encontrado.' })
  return property
})
