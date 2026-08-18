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

  // Atalho ?tenant=slug (dev + previews da Vercel, nunca em produção): troca o
  // tenant e grava cookie. (?tenant= vazio limpa).
  //
  // A query SEMPRE vence o cookie, e é isso que permite abrir dois tenants no
  // mesmo navegador: o cookie é compartilhado entre abas, a URL não. Cada aba
  // que carrega o parâmetro fica presa no seu tenant, independente do que outra
  // aba gravou. O cookie fica só como conveniência para navegação que perde a
  // query.
  if (import.meta.dev || useRuntimeConfig().allowTenantSwitch) {
    const q = getQuery(event)
    let devSlug = getCookie(event, DEV_TENANT_COOKIE) || undefined
    if (typeof q.tenant === 'string') {
      if (q.tenant.trim()) {
        devSlug = q.tenant.trim()
        setCookie(event, DEV_TENANT_COOKIE, devSlug, { path: '/', sameSite: 'lax' })
        // `setCookie` escreve só na resposta. O app.vue busca /api/tenant por
        // requestFetch, que repassa os cabeçalhos de ENTRADA — sem isto a
        // primeira visita com ?tenant= renderizava a landing da plataforma, e só
        // a segunda (já com o cookie no navegador) mostrava o tenant certo.
        event.node.req.headers.cookie = withDevTenantCookie(event.node.req.headers.cookie, devSlug)
      } else {
        deleteCookie(event, DEV_TENANT_COOKIE)
        event.node.req.headers.cookie = (event.node.req.headers.cookie || '')
          .split(';')
          .map((c) => c.trim())
          .filter((c) => c && c.split('=')[0]?.trim() !== DEV_TENANT_COOKIE)
          .join('; ')
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

  let tenant = await resolveTenantForHost(hostname)

  if (!tenant) {
    // Subdomínio não reconhecido de um domínio de cliente (o wildcard da Vercel
    // faz todos existirem): manda pro site dele em vez de exibir a landing da
    // plataforma dentro do domínio do próprio cliente.
    const base = await findRegisteredBaseDomain(hostname)
    if (base) {
      const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
      return sendRedirect(event, `${url.protocol}//${base}${url.pathname}${url.search}`, 302)
    }

    // Conveniência de dev: host qualquer cai no tenant de NUXT_DEFAULT_TENANT.
    // Vazio = sem fallback, que é como se testa localmente o comportamento de
    // produção (host desconhecido -> landing). Nada de slug hardcoded aqui: o
    // código da plataforma não deve conhecer o slug de nenhum cliente.
    const fallbackSlug = import.meta.dev ? useRuntimeConfig().defaultTenant : ''
    if (fallbackSlug) {
      tenant = await resolveTenantBySlug(fallbackSlug)
    }
  }

  if (!tenant) {
    // Host realmente desconhecido (ex.: <projeto>.vercel.app): landing da plataforma.
    event.context.platformRoot = true
    event.context.unknownHost = true
    return
  }
  event.context.tenant = tenant
})
