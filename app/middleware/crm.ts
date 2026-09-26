/**
 * Fecha a Agenda de quem não tem o CRM (0054). Mesmo desenho de
 * `area-cliente.ts`, e pelos mesmos motivos: é embalagem de produto, não
 * isolamento — e esconder só o item do menu deixaria o endereço digitável.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { crm, carregar } = useAdminFeatures()
  await carregar()

  if (!crm.value) return navigateTo('/admin')
})
