/**
 * Cache simples com TTL sobre o storage do Nitro.
 *
 * TTL curto de propósito: em serverless (Vercel) o `useStorage('cache')` vive
 * DENTRO de cada lambda, então `invalidateTenantCache` só limpa a instância que
 * atendeu o POST/PUT do painel — as outras instâncias quentes continuariam
 * servindo dado velho até expirar. Quem garante a atualização é o TTL, não a
 * invalidação. Mesmo raciocínio (e mesmo valor) do cache de tenant em
 * `server/utils/tenant.ts`.
 */
const DEFAULT_TTL_MS = 60 * 1000 // 1 minuto

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export async function cached<T>(key: string, factory: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const storage = useStorage('cache')
  const hit = (await storage.getItem<CacheEntry<T>>(key)) ?? null
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }
  const value = await factory()
  await storage.setItem(key, { value, expiresAt: Date.now() + ttlMs } satisfies CacheEntry<T>)
  return value
}

/** Chaves de cache por tenant — facilitam a invalidação. */
export function tenantCacheKey(tenantId: string, resource: string): string {
  return `tenant:${tenantId}:${resource}`
}

/** Invalida todo o cache de um tenant (chamado após salvar no painel). */
export async function invalidateTenantCache(tenantId: string): Promise<void> {
  const storage = useStorage('cache')
  const prefix = `tenant:${tenantId}:`
  const keys = await storage.getKeys(prefix)
  await Promise.all(keys.map((k) => storage.removeItem(k)))
}
