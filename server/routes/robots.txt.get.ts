/** robots.txt dinâmico por host, apontando para o sitemap do tenant. */
export default defineEventHandler((event) => {
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')

  // Host que não é tenant nem o domínio-raiz (ex.: <projeto>.vercel.app): serve a
  // landing, mas não pode ser indexado — seria a LP duplicada em outro domínio.
  if (event.context.unknownHost) {
    return ['User-agent: *', 'Disallow: /', ''].join('\n')
  }

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
