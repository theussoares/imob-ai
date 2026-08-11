import { listActiveProperties } from '~~/server/repositories/property.repository'

/** /llms.txt (llmstxt.org) — índice do site em Markdown para LLMs, por tenant. */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const list = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
    listActiveProperties(publicSupabase(), tenant.id),
  )
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=600')
  return buildLlmsTxt(tenant, list, origin)
})
