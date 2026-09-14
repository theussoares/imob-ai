import sharp, { type Sharp } from 'sharp'
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '~~/shared/utils/og-image'

/**
 * Converte a foto que está no Storage no card social 1200×630 em JPEG.
 *
 * Existe porque o que servimos ao navegador não serve às redes sociais: as
 * fotos do painel são WebP (que o WhatsApp não renderiza em preview) e mantêm a
 * proporção original (que o card 1,91:1 corta feio). Ver shared/utils/og-image.ts
 * para o diagnóstico completo.
 *
 * JPEG, não WebP nem AVIF: é o único formato que Facebook, WhatsApp, Instagram,
 * Telegram e LinkedIn tratam igual. Aqui a compatibilidade vale mais que os
 * bytes — o card é baixado por crawler, uma vez, e fica no CDN.
 */

/** Teto de bytes da foto de origem. Acima disso é erro de cadastro, não foto. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

/**
 * O crawler do WhatsApp desiste rápido. Melhor devolver o card de marca em 5s
 * que o card perfeito em 20s — que na prática vira preview nenhum.
 */
const FETCH_TIMEOUT_MS = 5000

/**
 * Qualidade do JPEG.
 *
 * 82 com mozjpeg deixa o card em ~120–180 KB. O limite importa: o WhatsApp
 * ignora og:image acima de ~600 KB, e é justamente por lá que o link mais
 * circula.
 */
const JPEG_QUALITY = 82

/** Cor de fundo quando a imagem não preenche o card (logo) ou não existe. */
const DEFAULT_BRAND = '#0f3d38'

/** Fração do card que a logo ocupa; o resto vira margem na cor da marca. */
const LOGO_SCALE = 0.76

/** Só aceita cor hex — o valor vem do banco e vai parar dentro de um SVG. */
function safeColor(value: string | null | undefined, fallback = DEFAULT_BRAND): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback
}

/**
 * Baixa a foto de origem.
 *
 * Só https, e nada de host interno: a URL vem do banco, mas o painel deixa
 * cadastrar imagem colando endereço de qualquer origem — sem esta trava, essa
 * caixa de texto viraria um proxy de requisição saindo do nosso servidor (SSRF).
 */
async function fetchSource(url: string): Promise<Buffer | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (/^(localhost$|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i.test(parsed.hostname)) {
    return null
  }

  const res = await fetch(parsed, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'image/*' },
  }).catch(() => null)
  if (!res?.ok) return null

  const declared = Number(res.headers.get('content-length') || 0)
  if (declared > MAX_SOURCE_BYTES) return null

  const bytes = Buffer.from(await res.arrayBuffer())
  return bytes.byteLength > MAX_SOURCE_BYTES ? null : bytes
}

function toJpeg(pipeline: Sharp): Promise<Buffer> {
  return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true }).toBuffer()
}

/**
 * Card sólido na cor da marca — o fundo de tudo, e o último recurso quando não
 * há foto nenhuma.
 *
 * Sem texto de propósito: o runtime da Vercel não traz fontes instaladas, então
 * `<text>` num SVG rasterizado pelo sharp sai em branco ou com glifos faltando.
 * Um retângulo na cor certa é modesto, mas é o que renderiza igual em todo
 * lugar — e ainda é muito melhor que preview sem imagem.
 */
function brandCanvas(color: string): Sharp {
  return sharp({
    create: {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      channels: 3,
      background: color,
    },
  })
}

export type OgSourceKind = 'photo' | 'logo'

/**
 * A partir de que proporção a foto pode ser CORTADA para caber no card.
 *
 * 1,2 deixa passar o que é foto de verdade (paisagem 4:3 = 1,33, 16:9 = 1,78):
 * cortar um pouco do céu e do chão não tira nada do imóvel.
 *
 * Abaixo disso a imagem é quadrada ou em pé — e em pé, num catálogo de imóvel,
 * quase nunca é foto: é a arte pronta que o corretor monta no Canva, com o
 * título em cima e o preço embaixo. Cortar essa arte para 1,91:1 come justamente
 * as duas pontas que carregam a informação. Essas entram inteiras, sobre um
 * fundo desfocado da própria imagem.
 */
const CROP_MIN_RATIO = 1.2

/** Fundo desfocado para a imagem que entra inteira: o raio é proporcional ao card. */
const BACKDROP_BLUR = 40

/**
 * Renderiza o card social.
 *
 * Três enquadramentos, porque três tipos de imagem chegam aqui:
 *
 * - foto em paisagem: preenche o card e corta o excedente PELO CENTRO. Corte
 *   central, e não o `attention` do sharp (guiado por entropia): numa foto de
 *   imóvel o assunto está no meio, e um corte previsível é mais fácil de
 *   explicar ao cliente que um heurístico que às vezes enquadra uma janela;
 * - imagem quadrada ou em pé: entra INTEIRA, centralizada, sobre uma cópia
 *   ampliada e desfocada dela mesma. É o que preserva a arte do Canva — e o
 *   fundo desfocado preenche as laterais sem deixar duas tarjas chapadas;
 * - logo: cabe inteira sobre a cor da marca, sem desfoque. Logo cortada é pior
 *   que logo pequena, e a maioria é PNG/WebP transparente — sem o fundo sólido
 *   ela sai preta no WhatsApp.
 *
 * Falha (URL fora do ar, formato que o sharp não abre, timeout) devolve o card
 * de marca. Nunca lança: uma exceção aqui é preview sem imagem, exatamente o que
 * esta rota existe para corrigir.
 */
export async function renderOgCard(
  source: string | null | undefined,
  kind: OgSourceKind,
  brandColor: string | null | undefined,
): Promise<Buffer> {
  const color = safeColor(brandColor)
  const bytes = source ? await fetchSource(source).catch(() => null) : null
  return frameOgCard(bytes, kind, color)
}

/**
 * O enquadramento propriamente dito, já com os bytes em mãos.
 *
 * Separado de `renderOgCard` para ser testável sem rede: é aqui que mora a
 * decisão entre cortar e preservar, que é o que pode sair errado.
 */
export async function frameOgCard(
  bytes: Buffer | null,
  kind: OgSourceKind,
  brandColor: string | null | undefined,
): Promise<Buffer> {
  const color = safeColor(brandColor)
  if (!bytes) return toJpeg(brandCanvas(color))

  try {
    // `limitInputPixels` trava bomba de descompressão: um arquivo de poucos KB
    // pode declarar 40000×40000 e estourar a memória da função.
    //
    // `rotate()` sem argumento aplica a orientação do EXIF. As derivadas do
    // painel já chegam em pé (o canvas do navegador resolve isso no upload), mas
    // imagem cadastrada colando URL vem crua — e sem isto a foto do celular sai
    // deitada no preview.
    const open = () => sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate()

    if (kind === 'logo') return await toJpeg(contained(open(), color))

    const meta = await open().metadata()
    const ratio = meta.width && meta.height ? meta.width / meta.height : 0

    if (ratio >= CROP_MIN_RATIO) {
      return await toJpeg(
        open()
          .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
          .flatten({ background: color }),
      )
    }

    // Fundo: a própria imagem ampliada até cobrir o card e desfocada. Escurecer
    // um pouco separa o fundo da imagem da frente, que senão se dissolve nele.
    const backdrop = await open()
      .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
      .blur(BACKDROP_BLUR)
      .modulate({ brightness: 0.75 })
      .flatten({ background: color })
      .toBuffer()

    const foreground = await open()
      .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: 'inside', withoutEnlargement: false })
      .toBuffer()

    return await toJpeg(sharp(backdrop).composite([{ input: foreground, gravity: 'centre' }]))
  } catch {
    return toJpeg(brandCanvas(color))
  }
}

/**
 * Encaixa a imagem inteira numa área menor que o card, com o resto virando
 * margem na cor da marca.
 *
 * A margem é o QUE SOBRA do card depois da área interna, e não
 * `(1 - LOGO_SCALE) / 2` arredondado dos dois lados: arredondar cada lado por
 * conta própria devolvia 631px de altura, e o card tem que bater exatamente com
 * o og:image:height anunciado.
 */
function contained(input: Sharp, color: string): Sharp {
  const innerWidth = Math.round(OG_IMAGE_WIDTH * LOGO_SCALE)
  const innerHeight = Math.round(OG_IMAGE_HEIGHT * LOGO_SCALE)
  const padX = OG_IMAGE_WIDTH - innerWidth
  const padY = OG_IMAGE_HEIGHT - innerHeight

  return input
    .resize(innerWidth, innerHeight, { fit: 'contain', background: color })
    .extend({
      top: Math.floor(padY / 2),
      bottom: padY - Math.floor(padY / 2),
      left: Math.floor(padX / 2),
      right: padX - Math.floor(padX / 2),
      background: color,
    })
    // `flatten` é obrigatório antes do JPEG: JPEG não tem canal alfa, e sem isso
    // o transparente da logo é preenchido com PRETO pelo encoder.
    .flatten({ background: color })
}
