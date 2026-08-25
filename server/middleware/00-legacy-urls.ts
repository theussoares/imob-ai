import type { PropertyUrlFields } from '~~/shared/utils/property-url'
import { listActiveProperties } from '~~/server/repositories/property.repository'
import { legacyRedirectFor } from '~~/server/utils/legacy-urls'

// Prefixo `00-` de propósito: middleware do Nitro roda em ordem alfabética de
// nome de arquivo, e o agents.ts (Task 6) passa a tratar qualquer caminho de
// dois segmentos como página de imóvel. Sem rodar antes dele, /imovel/{codigo}
// seria servido como markdown 200 em vez do 301 daqui.
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return
  const path = (event.path || '').split('?')[0] || '/'
  if (!path.startsWith('/imovel/') && path !== '/') return

  // Sem tenant não há para onde redirecionar: domínio-raiz da plataforma ou
  // host desconhecido caem aqui. Comparar host com platformDomain (via
  // isPlatformRootHost) não bastava — em dev, NUXT_PLATFORM_DOMAIN=localhost
  // faz esse comparativo "acertar" mesmo com o tenant tres-lagoas semeado em
  // localhost (supabase/migrations/0004_seed_tres_lagoas.sql), derrubando os
  // dois redirects abaixo. Resolver o tenant de verdade cobre os dois
  // ambientes com a mesma linha.
  const tenant = event.context.tenant ?? (await resolveTenantForHost(getHostname(event)))
  if (!tenant) return

  // A lista ativa do tenant já está cacheada — é o mesmo cache que o agents.ts
  // usa —, então resolver o código aqui não custa consulta extra.
  let lista: PropertyUrlFields[] = []
  if (path.startsWith('/imovel/')) {
    lista = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
      listActiveProperties(publicSupabase(), tenant.id),
    )
  }

  const destino = legacyRedirectFor(path, getQuery(event) as Record<string, string>, (code) =>
    lista.find((p) => p.code.toLowerCase() === code.toLowerCase()) ?? null,
  )
  if (destino) return sendRedirect(event, destino, 301)
})
