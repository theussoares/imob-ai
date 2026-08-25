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
    return p ? propertyPath(p) : null
  }

  if (path === '/') {
    const purpose = query.purpose
    if (purpose === 'aluguel' || purpose === 'venda') {
      return `/imoveis/${categorySlug({ type: null, purpose })}`
    }
  }

  return null
}
