import { getPropertyByCodeWithBrokerPhone } from '~~/server/repositories/property.repository'

/**
 * Detalhe de um imóvel por código — query direta, com cache próprio.
 * Antes carregava a lista completa do tenant e fazia `.find()`: com muitos
 * imóveis isso significava desserializar o catálogo inteiro a cada pageview.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const code = getRouterParam(event, 'code')
  if (!code) throw createError({ statusCode: 400, statusMessage: 'Código inválido.' })

  const property = await cached(
    tenantCacheKey(tenant.id, `property:${code.toLowerCase()}`),
    () => getPropertyByCodeWithBrokerPhone(serviceSupabase(), tenant.id, code),
  )
  if (!property) throw createError({ statusCode: 404, statusMessage: 'Imóvel não encontrado.' })
  return property
})
