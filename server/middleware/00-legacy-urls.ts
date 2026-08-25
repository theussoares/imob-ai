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
  // Domínio-raiz da plataforma não tem tenant nem categoria: sem este guard,
  // `/?purpose=venda` ali redirecionaria para /imoveis/a-venda, página que
  // exige tenant e quebraria. Não dá pra usar event.context.platformRoot aqui
  // porque este middleware roda antes do tenant.ts (que é quem o define) na
  // ordem alfabética — daí checar o host diretamente.
  if (isPlatformRootHost(getHostname(event))) return

  // A lista ativa do tenant já está cacheada — é o mesmo cache que o agents.ts
  // usa —, então resolver o código aqui não custa consulta extra.
  let lista: PropertyUrlFields[] = []
  if (path.startsWith('/imovel/')) {
    const tenant = event.context.tenant ?? (await resolveTenantForHost(getHostname(event)))
    if (!tenant) return
    lista = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
      listActiveProperties(publicSupabase(), tenant.id),
    )
  }

  const destino = legacyRedirectFor(path, getQuery(event) as Record<string, string>, (code) =>
    lista.find((p) => p.code.toLowerCase() === code.toLowerCase()) ?? null,
  )
  if (destino) return sendRedirect(event, destino, 301)
})
