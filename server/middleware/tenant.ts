/** Resolve o tenant (imobiliária) por domínio/subdomínio em cada requisição. */
export default defineEventHandler(async (event) => {
  const path = event.path || ''
  // Ignora assets internos e endpoints que não dependem de tenant
  // (robots.txt e /.well-known/* só usam a origin — não devem falhar por causa do banco).
  if (
    path.startsWith('/_') ||
    path.startsWith('/__') ||
    path.startsWith('/favicon') ||
    path === '/robots.txt' ||
    path.startsWith('/.well-known/')
  ) {
    return
  }

  // Atalho de desenvolvimento: ?tenant=slug troca o tenant e grava cookie.
  // (?tenant= vazio limpa). Desativado em produção.
  if (import.meta.dev) {
    const q = getQuery(event)
    let devSlug = getCookie(event, 'dev_tenant') || undefined
    if (typeof q.tenant === 'string') {
      if (q.tenant.trim()) {
        devSlug = q.tenant.trim()
        setCookie(event, 'dev_tenant', devSlug, { path: '/', sameSite: 'lax' })
      } else {
        deleteCookie(event, 'dev_tenant')
        devSlug = undefined
      }
    }
    if (devSlug) {
      const t = await resolveTenantBySlug(devSlug)
      if (t) {
        event.context.tenant = t
        return
      }
    }
  }

  const hostname = getHostname(event)
  // Domínio-raiz da plataforma: sem tenant, renderiza a landing da Moradi.
  if (isPlatformRootHost(hostname)) {
    event.context.platformRoot = true
    return
  }
  event.context.tenant = await resolveTenantForHost(hostname)
})
