/** API catalog (RFC 9727) — descoberta automática da API pública. */
export default defineEventHandler((event) => {
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  const linkset = {
    linkset: [
      {
        anchor: `${origin}/api/properties`,
        'service-doc': [{ href: `${origin}/`, title: 'Catálogo de imóveis (HTML / Markdown)' }],
        status: [{ href: `${origin}/api/tenant`, title: 'Dados da imobiliária' }],
        item: [
          { href: `${origin}/api/properties`, title: 'Imóveis publicados (JSON)' },
          { href: `${origin}/api/properties/{code}`, title: 'Imóvel por código (JSON)' },
        ],
      },
      {
        anchor: `${origin}/`,
        describedby: [{ href: `${origin}/sitemap.xml`, type: 'application/xml' }],
      },
    ],
  }

  setHeader(event, 'content-type', 'application/linkset+json; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return JSON.stringify(linkset, null, 2)
})
