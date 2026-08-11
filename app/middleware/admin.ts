/** Protege as rotas do painel: exige usuário autenticado. */
export default defineNuxtRouteMiddleware(() => {
  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo('/admin/login')
  }
})
