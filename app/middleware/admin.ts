/** Protege as rotas do painel: exige usuário autenticado (sessão no client). */
export default defineNuxtRouteMiddleware(async () => {
  // O painel é SPA — a sessão vive no client (localStorage).
  if (import.meta.server) return
  const { user, init } = useAdminAuth()
  if (user.value === null) await init()
  if (!user.value) {
    return navigateTo('/admin/login')
  }
})
