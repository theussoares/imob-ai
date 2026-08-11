/** Resolve o tenant (imobiliária) a partir do domínio em cada requisição. */
export default defineEventHandler(async (event) => {
  const path = event.path || ''
  // Ignora assets internos do Nuxt/Nitro.
  if (path.startsWith('/_') || path.startsWith('/__') || path.startsWith('/favicon')) return
  const hostname = getHostname(event)
  event.context.tenant = await resolveTenantForHost(hostname)
})
