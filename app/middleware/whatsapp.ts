/**
 * Fecha Conversas de quem não tem o recurso (0059). Mesmo desenho de `crm.ts`:
 * embalagem de produto — quem protege os dados é o servidor (`exigirWhatsapp`)
 * e a RLS.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { whatsapp, carregar } = useAdminFeatures()
  await carregar()

  if (!whatsapp.value) return navigateTo('/admin')
})
