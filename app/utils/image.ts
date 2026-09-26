/**
 * Redimensiona e converte imagens (WebP, ou JPEG/PNG onde não há WebP) no
 * próprio navegador, antes do upload. Sem isto, a foto original do celular (3–4 MB, 3000×4000) vai crua pro
 * Storage e é servida assim até num thumbnail de 84×60 — era o maior custo de
 * bytes do site.
 */

/** Lado maior das derivadas geradas para cada foto de imóvel. */
export const IMAGE_SIZE_LG = 1600
export const IMAGE_SIZE_SM = 640

/**
 * Para onde cair quando o navegador não codifica WebP. Foto vai para JPEG;
 * logo vai para PNG, porque JPEG não tem transparência e o fundo do logo
 * viraria um retângulo preto sobre o header.
 */
export type FallbackType = 'image/jpeg' | 'image/png'

export interface EncodedImage {
  blob: Blob
  /** Extensão do arquivo, do formato que o navegador DE FATO produziu. */
  ext: 'webp' | 'jpg' | 'png'
  contentType: 'image/webp' | 'image/jpeg' | 'image/png'
}

type Encode = (type: string, quality: number) => Promise<Blob | null>

const EXT: Record<EncodedImage['contentType'], EncodedImage['ext']> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/**
 * Pede WebP e confere o que voltou.
 *
 * ⚠️ O incidente que motivou isto (24/09): `canvas.toBlob(cb, 'image/webp')`
 * não falha quando o navegador não sabe codificar WebP — o Safari devolve
 * **PNG** em silêncio, e a especificação manda fazer exatamente isso. O código
 * anterior confiava no tipo pedido e subia o PNG com nome `@sm.webp` e
 * `contentType: image/webp`. Os cards da home da Olmi chegaram a 240–500 KB
 * cada, em 640×360, quando o WebP de verdade teria ~40 KB: 1,6 MB desperdiçados
 * por visita no celular, segundo o PageSpeed.
 *
 * O PNG não é descartado por ser inválido — ele abre normalmente, e por isso
 * ninguém viu. É descartado por ser sem perda: foto em PNG é o pior formato
 * possível para a web.
 *
 * Recebe `encode` por parâmetro para ser testável em Node, sem canvas.
 */
export async function encodeWithFallback(
  encode: Encode,
  fallback: FallbackType,
  quality: number,
): Promise<EncodedImage> {
  const webp = await encode('image/webp', quality)
  if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp', contentType: 'image/webp' }

  const blob = await encode(fallback, quality)
  // O PNG não tem parâmetro de qualidade, e JPEG todo navegador codifica —
  // se nem o fallback vier no tipo pedido, subir seria repetir o bug.
  if (!blob || blob.type !== fallback) {
    throw new Error('Este navegador não conseguiu converter a imagem. Tente outro navegador.')
  }
  return { blob, ext: EXT[fallback], contentType: fallback }
}

/**
 * Reduz a imagem para caber em `maxEdge` (preservando proporção), em WebP
 * quando o navegador sabe gerar e em `fallback` quando não sabe.
 * Nunca amplia: imagem menor que o alvo é só convertida.
 */
export async function resizeForUpload(
  file: File,
  maxEdge: number,
  fallback: FallbackType,
  quality = 0.82,
): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível neste navegador.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await encodeWithFallback(
      (type, q) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q)),
      fallback,
      quality,
    )
  } finally {
    bitmap.close()
  }
}

/** True para o que dá pra processar no canvas (SVG e HEIC ficam de fora). */
export function isResizableImage(file: File): boolean {
  return /^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.type)
}

/**
 * Deriva uma URL da API de transformação de imagem do Supabase
 * (`/render/image/public/...?width=&height=&quality=`) a partir da URL
 * pública normal (`/object/public/...`). `resize=contain` porque só reduz —
 * nunca corta a foto como `cover` faria.
 *
 * Foi testada como alternativa às derivadas `urlSm` geradas no upload (uma
 * foto só, redimensionada sob demanda, em vez de duas subidas fixas) — mas
 * pra foto de imóvel isso estourou a cota de Image Transformations da conta
 * (toda foto de todo tenant passava por aqui pra montar QUALQUER srcset; ver
 * useImageCarousel.ts). Voltou a ser exceção, não regra: continua servindo
 * hero, foto de corretor e blocos do "Quem somos" — poucas fotos por tenant,
 * onde ainda não existe derivada pequena pré-gerada.
 */
export function supabaseRenderImage(
  url: string,
  opts?: { width?: number; height?: number; quality?: number },
): string {
  if (!url) return url

  const renderUrl = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  // URL externa (colada à mão, sem passar pelo nosso Storage): sem transformação.
  if (renderUrl === url) return url

  const width = opts?.width ?? 600
  const height = opts?.height ?? 600
  const quality = opts?.quality ?? 60
  const sep = renderUrl.includes('?') ? '&' : '?'

  return `${renderUrl}${sep}width=${width}&height=${height}&resize=contain&quality=${quality}`
}

/**
 * `srcset` por largura para foto do "Quem somos", pela mesma API de
 * transformação.
 *
 * A altura pedida é o dobro da largura de propósito: com `resize=contain` a
 * caixa é um teto, e só a largura pode ser o lado que limita — é o que torna o
 * descritor `480w` verdadeiro para foto em pé e deitada. Com a altura igual à
 * largura, uma foto em pé sairia mais estreita que o `w` anunciado, e o
 * navegador escolheria a versão errada.
 *
 * Poucas larguras (duas, em geral): cada uma é uma transformação a mais por
 * foto, e esta API já estourou cota uma vez (ver `supabaseRenderImage`).
 * URL externa não tem transformação — devolve vazio e o `src` segura sozinho.
 */
export function supabaseSrcset(url: string, widths: number[], quality = 75): string {
  if (!url || !url.includes('/storage/v1/object/public/')) return ''
  return widths
    .map((w) => `${supabaseRenderImage(url, { width: w, height: w * 2, quality })} ${w}w`)
    .join(', ')
}
