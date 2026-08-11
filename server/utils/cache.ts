/**
 * Cache simples com TTL sobre o storage do Nitro.
 * Atende ao requisito: servir do cache por ~10 min e, na próxima requisição
 * após expirar, refazer a chamada para atualizar os dados.
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000 // 10 minutos

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
