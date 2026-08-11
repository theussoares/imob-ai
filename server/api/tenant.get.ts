/** Dados públicos do tenant (branding + contato). Já resolvido/cacheado no middleware. */
export default defineEventHandler((event) => {
  return useTenantContext(event)
})
