/** Dados públicos do tenant (branding + contato). No domínio-raiz, sinaliza a landing. */
export default defineEventHandler((event) => {
  if (event.context.platformRoot) return { platformRoot: true as const }
  return useTenantContext(event)
})
