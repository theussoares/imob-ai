/**
 * Caminhos que o navegador busca na RAIZ da origem por conta do PWA.
 *
 * Eles não são páginas, mas também não caem em nenhum dos prefixos que o
 * middleware do painel já libera (`/admin`, `/api/`, `/_`...). Sem esta lista,
 * `admin-host.ts` responderia 302 para `/admin` no lugar deles: o navegador
 * pediria o manifest e receberia HTML, e o registro do service worker falharia
 * — as duas coisas em silêncio, porque nada na tela do painel quebra por isso.
 *
 * O service worker precisa estar na raiz para poder controlar a origem inteira:
 * um SW servido de `/algum/lugar/sw.js` só governa `/algum/lugar/`.
 */
const PWA_PATHS = new Set(['/manifest.webmanifest', '/sw.js', '/registerSW.js'])

/** Prefixo dos runtimes que o Workbox emite junto do service worker. */
const WORKBOX_PREFIX = '/workbox-'

export function isPwaPath(path: string): boolean {
  return PWA_PATHS.has(path) || path.startsWith(WORKBOX_PREFIX)
}

/** O rótulo embaixo do ícone é curto na tela inicial; o resto é cortado mesmo. */
const SHORT_NAME_MAX = 12

/**
 * Monta o manifest do painel.
 *
 * `name` é null quando o tenant não pôde ser resolvido (banco fora). Isso é um
 * estado de verdade, não um nome — a primeira versão usava a string 'Painel'
 * como sentinela e gerava "Painel de gestão de Painel" na descrição, além de
 * tratar errado uma imobiliária que por acaso se chamasse Painel.
 */
export function buildPanelManifest(name: string | null, themeColor: string) {
  const nome = name?.trim() || null
  const curto = nome && nome.length > SHORT_NAME_MAX ? nome.slice(0, SHORT_NAME_MAX).trim() : nome

  return {
    // Explícito para não depender do default (que é o start_url): assim mudar o
    // start_url um dia não faz o navegador tratar como se fosse outro app.
    id: '/admin',
    name: nome ? `Painel · ${nome}` : 'Painel',
    short_name: curto || 'Painel',
    description: nome ? `Painel de gestão de ${nome}` : 'Painel de gestão',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: '/admin',
    // A origem inteira é o painel (admin-host.ts manda o resto para /admin),
    // então o escopo é a raiz — não `/admin/`.
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor,
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separado do "any" de propósito: o Android recorta até 20% de cada borda
      // para aplicar a máscara dele, e um ícone desenhado para a borda sai com o
      // conteúdo cortado. Este tem a área segura respeitada.
      { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
