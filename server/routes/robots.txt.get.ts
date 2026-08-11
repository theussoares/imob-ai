/** robots.txt dinâmico por host, apontando para o sitemap do tenant. */
export default defineEventHandler((event) => {
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    // Content Signals (contentsignals.org): permitir busca e respostas de IA
    // com atribuição; não permitir uso para treinamento de modelos.
    'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
})
