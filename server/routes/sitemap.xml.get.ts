import { listActiveProperties } from '~~/server/repositories/property.repository'

/** Sitemap dinâmico por host (tenant). */
export default defineEventHandler(async (event) => {
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  // Domínio-raiz da plataforma: sitemap mínimo (só a landing).
  if (event.context.platformRoot) {
    setHeader(event, 'content-type', 'application/xml; charset=utf-8')
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${origin}/</loc><priority>1.0</priority></url>\n` +
      `</urlset>\n`
    )
  }

  const tenant = useTenantContext(event)
  const list = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
    listActiveProperties(publicSupabase(), tenant.id),
  )

  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: `${origin}/`, priority: '1.0' },
    ...list.map((p) => ({
      loc: `${origin}/imovel/${encodeURIComponent(p.code)}`,
      lastmod: p.updatedAt,
      priority: '0.8',
    })),
  ]

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc}</loc>` +
          (u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : '') +
          `<priority>${u.priority}</priority></url>`,
      )
      .join('\n') +
    `\n</urlset>\n`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=600')
  return body
})
