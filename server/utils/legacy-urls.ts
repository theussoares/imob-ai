import type { PropertyUrlFields } from '~~/shared/utils/property-url'
import { propertyPath } from '~~/shared/utils/property-url'
import { categorySlug } from '~~/shared/utils/category'

/**
 * Para onde uma URL antiga deve apontar. `null` = não é URL antiga, segue o
 * fluxo normal.
 *
 * Separada do handler porque `defineEventHandler` roda no import e não existe
 * fora do runtime do Nuxt: junto, o teste explodiria antes da primeira asserção.
 */
export function legacyRedirectFor(
  path: string,
  query: Record<string, string>,
  lookup: (code: string) => PropertyUrlFields | null,
): string | null {
  if (path.startsWith('/imovel/')) {
    const code = decodeURIComponent(path.slice('/imovel/'.length))
    const p = lookup(code)
    // Preserva o resto da query (fbclid, gclid, ...): Instagram e Facebook Ads
    // acrescentam esses parâmetros a todo link de saída, e é exatamente o
    // tráfego que esta migração existe para proteger.
    return p ? withQuery(propertyPath(p), query) : null
  }

  if (path === '/') {
    // `purpose` já foi consumido pelo redirect — o resto (fbclid, gclid, ...)
    // segue para o destino.
    const { purpose, ...resto } = query
    if (purpose === 'aluguel' || purpose === 'venda') {
      return withQuery(`/imoveis/${categorySlug({ type: null, purpose })}`, resto)
    }
  }

  return null
}

function withQuery(base: string, query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString()
  return qs ? `${base}?${qs}` : base
}
