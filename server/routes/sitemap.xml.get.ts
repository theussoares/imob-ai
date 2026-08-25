import { listActiveProperties } from '~~/server/repositories/property.repository'
import { qualifyingCategories, categorySlug } from '~~/shared/utils/category'
import { propertyPath } from '~~/shared/utils/property-url'

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

  // Categorias entram antes dos imóveis: são páginas de nível intermediário e
  // só existem quando passam do piso de conteúdo — a mesma regra da página, pra
  // não publicar no sitemap URL que responde 404.
  const categories = qualifyingCategories(list).map((c) => ({
    loc: `${origin}/imoveis/${categorySlug(c)}`,
    priority: '0.9',
  }))

  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: `${origin}/`, priority: '1.0' },
    // Página de conteúdo próprio, não gerada a partir do catálogo: entra sempre,
    // sem piso de conteúdo, porque não depende de haver imóvel cadastrado.
    { loc: `${origin}/quero-vender`, priority: '0.9' },
    ...categories,
    ...list.map((p) => ({
      loc: `${origin}${propertyPath(p)}`,
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
