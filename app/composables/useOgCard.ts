import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '~~/shared/utils/og-image'

/**
 * Anuncia o card social da página — o conjunto INTEIRO de tags, não só og:image.
 *
 * Existe como composable porque as tags andam juntas e esquecer uma quebra o
 * preview de um jeito difícil de perceber:
 *
 * - `og:image:width` / `height`: sem elas o Facebook busca a imagem de forma
 *   assíncrona, e o PRIMEIRO compartilhamento de um link novo sai sem imagem —
 *   só o segundo acerta. É o sintoma clássico de "às vezes aparece, às vezes não";
 * - `og:image:type`: declara image/jpeg, o formato que as redes aceitam
 *   (ver shared/utils/og-image.ts);
 * - `og:image:secure_url`: o WhatsApp prefere esta quando existe — mas ela
 *   significa "a versão https desta imagem", então só sai quando a URL É https
 *   (em dev o site roda em http, e anunciar http aqui é declarar o contrário do
 *   que a tag quer dizer);
 * - `twitter:image`: o Twitter/X até cai no og:image, mas o LinkedIn e alguns
 *   leitores de preview não.
 *
 * Chamado uma vez no app.vue com o card da home (para nenhuma página ficar sem
 * imagem) e sobrescrito nas páginas que têm imagem própria.
 */
export function useOgCard(get: () => { url: string; alt?: string }) {
  useSeoMeta({
    ogImage: () => get().url,
    ogImageSecureUrl: () => (get().url.startsWith('https://') ? get().url : undefined),
    ogImageType: 'image/jpeg',
    ogImageWidth: OG_IMAGE_WIDTH,
    ogImageHeight: OG_IMAGE_HEIGHT,
    ogImageAlt: () => get().alt || undefined,
    twitterImage: () => get().url,
    twitterImageAlt: () => get().alt || undefined,
  })
}
