import type { CardPhoto } from '~~/shared/models/property'

/**
 * Reduz cada foto de card ao endereço que o card de fato usa.
 *
 * O motivo é o payload da home, medido em 24/09 na Olmi: 163 KB de
 * `__NUXT_DATA__`, mais da metade do HTML, para 12 cards visíveis. 45% eram URLs
 * de foto (612 delas — 62 imóveis × 5 fotos × 2 derivadas) e mais 27% eram as
 * chaves e ids desses objetos. O card mostra só a derivada de 640px
 * (`useImageCarousel` sem `full`), e nada nele lê `id`, `alt`, `position` ou
 * `isCover` da foto.
 *
 * - **Capa** (`[0]`): mantém `url` e `urlSm`. A `url` grande alimenta a imagem
 *   de compartilhamento da home (`homeOgImage`), calculada a partir desta mesma
 *   lista.
 * - **Demais**: um endereço só — a derivada pequena, ou a original quando a
 *   foto não passou pelo uploader (`urlSm` nulo).
 *
 * A ordem é preservada: a capa continua em `[0]`, como o card e o
 * `homeOgImage` assumem.
 */
export function enxugarFotosDoCard(fotos: readonly CardPhoto[]): CardPhoto[] {
  return fotos.map((f, i) =>
    i === 0 ? { url: f.url, urlSm: f.urlSm ?? null } : { url: f.urlSm || f.url },
  )
}

export function enxugarCards<T extends { images: readonly CardPhoto[] }>(cards: readonly T[]): T[] {
  return cards.map((c) => ({ ...c, images: enxugarFotosDoCard(c.images) }))
}
