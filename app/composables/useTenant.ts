import type { Tenant } from '~~/shared/models/tenant'

/** Estado global do tenant atual (carregado uma vez no app.vue). */
export function useTenant() {
  return useState<Tenant | null>('tenant', () => null)
}
