/**
 * Imagem de preview (og:image) — a que aparece ao colar o link no WhatsApp, no
 * Facebook ou no Instagram.
 *
 * Este arquivo decide DUAS coisas, e só elas:
 *   1. qual foto de origem cada página anuncia;
 *   2. a URL da rota que converte essa foto no card social.
 *
 * A conversão em si mora no servidor (`server/utils/og-render.ts`), porque as
 * redes sociais não aceitam o que está no Storage:
 *
 * - o WhatsApp NÃO renderiza WebP em preview de link, e o Facebook documenta
 *   apenas JPEG/PNG/GIF em `og:image` — mas todo upload do painel é convertido
 *   para WebP (ver app/utils/image.ts). Era por isso que imóvel com foto enviada
 *   pelo painel não mostrava imagem, e imóvel com foto colada por URL (JPEG)
 *   mostrava: parecia aleatório, e era o formato;
 * - o card social é 1,91:1. As derivadas têm 1600px no lado maior preservando a
 *   proporção, então foto de celular em pé chegava 1200×1600 e virava um
 *   quadradinho cortado.
 *
 * A rota /og resolve os dois de uma vez: devolve sempre JPEG 1200×630.
 */

/**
 * Proporção 1,91:1 — o formato do card grande em Facebook, WhatsApp, Telegram e
 * LinkedIn. Declarado em og:image:width/height: sem as dimensões, a primeira
 * raspagem do Facebook costuma sair SEM imagem (ele busca a foto de forma
 * assíncrona e só o segundo compartilhamento acerta).
 */
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

/** Só o que estes helpers precisam do card — mantém as funções testáveis sem o modelo inteiro. */
interface ComFotos {
  images?: { url: string }[]
}

/** Só o que estes helpers precisam do tenant, pelo mesmo motivo. */
interface ComMarca {
  heroImage?: string | null
  logoUrl?: string | null
}

/** Trata "", "   " e null como ausente: o tenant `demo` guarda string vazia, não null. */
function preenchido(value: string | null | undefined): string | undefined {
  const v = (value || '').trim()
  return v || undefined
}

/**
 * Foto de origem do card da home.
 *
 * Ordem: hero → capa do imóvel em destaque → logo.
 *
 * O hero vem primeiro porque é uma FOTO, escolhida pelo próprio cliente para
 * representar o site — ela preenche o card inteiro e é o que dá clique. A logo
 * desceu para último: é quase sempre quadrada ou transparente, e mesmo
 * convertida ela vira uma marca pequena no meio de um retângulo vazio.
 *
 * A lista chega ordenada por destaque (ver `listActivePropertyCards`), então o
 * "primeiro imóvel" é o em destaque quando existe um.
 */
export function homeOgImage(tenant: ComMarca | null | undefined, properties: ComFotos[]): string | undefined {
  const hero = preenchido(tenant?.heroImage)
  if (hero) return hero

  // Imóvel sem foto cadastrada tem `images: []`; pular para o próximo é melhor
  // que desistir quando há foto logo abaixo. A capa é sempre `images[0]`
  // (ver `toPropertyCardModel`).
  const capa = properties.find((p) => p.images?.[0]?.url)?.images?.[0]?.url
  if (capa) return capa

  return preenchido(tenant?.logoUrl)
}

/**
 * Hash curto e estável de uma string (FNV-1a em base36).
 *
 * Serve de cache-buster na URL do card, e não de segurança — daí um hash de
 * brinquedo em vez de crypto (que seria assíncrono no navegador e obrigaria o
 * SSR e a hidratação a concordarem sobre uma Promise).
 *
 * É o que conserta "troquei a foto do imóvel e o WhatsApp continua mostrando a
 * antiga": o WhatsApp guarda o preview POR URL e não revalida, então mudar a
 * foto precisa mudar a URL anunciada.
 */
export function ogVersion(source: string | null | undefined): string {
  let hash = 0x811c9dc5
  const s = source || ''
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/**
 * URL do card social da home (e de toda página que não tem imagem própria:
 * categorias, bairros, "quero vender").
 *
 * Caminho absoluto, não relativo: `og:image` relativo é ignorado por boa parte
 * dos crawlers. Quem monta a origin é quem chama, sempre o host da requisição
 * — o mesmo princípio multitenant do canonical.
 */
export function homeOgUrl(origin: string, source: string | null | undefined): string {
  return `${origin}/og/home.jpg?v=${ogVersion(source)}`
}

/** URL do card social de um imóvel. `code` é o código público (VD-0019). */
export function propertyOgUrl(origin: string, code: string, source: string | null | undefined): string {
  return `${origin}/og/imovel/${encodeURIComponent(code)}.jpg?v=${ogVersion(source)}`
}
