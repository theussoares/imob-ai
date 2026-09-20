import { listPublicBrokers } from '~~/server/repositories/broker.repository'

/** Corretores que optaram por aparecer na vitrine pública (bloco "equipe" da página "Quem somos"). */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  return cached(tenantCacheKey(tenant.id, 'brokers:public'), () => listPublicBrokers(serviceSupabase(), tenant.id))
})
