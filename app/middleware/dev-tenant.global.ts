/**
 * Mantém `?tenant=` na URL ao navegar dentro do app, fora de produção.
 *
 * O tenant de desenvolvimento também fica num cookie, mas cookie é compartilhado
 * entre abas: com duas abas abertas em tenants diferentes, a última a carregar
 * venceria nas duas. A query é por aba — preservá-la nos links é o que permite
 * comparar dois clientes lado a lado no mesmo navegador.
 */
export default defineNuxtRouteMiddleware((to, from) => {
  if (!import.meta.dev && !useRuntimeConfig().public.allowTenantSwitch) return

  const atual = from.query.tenant
  if (typeof atual !== 'string' || !atual) return
  if (to.query.tenant) return

  return navigateTo({ path: to.path, query: { ...to.query, tenant: atual }, hash: to.hash })
})
