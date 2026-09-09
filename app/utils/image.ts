/**
 * Redimensiona e converte imagens para WebP no próprio navegador, antes do
 * upload. Sem isto, a foto original do celular (3–4 MB, 3000×4000) vai crua pro
 * Storage e é servida assim até num thumbnail de 84×60 — era o maior custo de
 * bytes do site.
 */

/** Lado maior das derivadas geradas para cada foto de imóvel. */
export const IMAGE_SIZE_LG = 1600
export const IMAGE_SIZE_SM = 640

/** Extensão de arquivo para cada formato que o `toBlob` pode devolver. */
const EXTENSAO: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export interface ImagemRedimensionada {
  blob: Blob
  /** Extensão do formato que o navegador REALMENTE codificou. */
  ext: string
  /** Mime do mesmo formato, para o `contentType` do upload. */
  contentType: string
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter a imagem.'))),
      type,
      quality,
    ),
  )
}

/**
 * Reduz a imagem para caber em `maxEdge` (preservando proporção) e devolve o
 * arquivo junto com o formato em que ele saiu. Nunca amplia: imagem menor que o
 * alvo é só convertida.
 *
 * ## Por que o formato é devolvido, e não assumido
 *
 * `canvas.toBlob` não avisa quando não sabe codificar o tipo pedido: o spec
 * manda cair para PNG calado. Safari só passou a codificar WebP na 16.4, então
 * quem sobe foto de um aparelho mais velho gerava PNG — que era salvo com nome
 * `.webp` e `contentType: 'image/webp'`, porque o código assumia ter recebido o
 * que pediu. Nada quebrava na tela (o navegador farja pelo conteúdo), só pesava
 * ~10x.
 *
 * Em 09/09/2026 isso era 686 dos 990 arquivos do bucket e 719 MB dos 741 MB —
 * 97% do espaço, escondido atrás de uma extensão que mentia. Uma imobiliária
 * inteira estava em 1737 kB por foto enquanto a outra, em navegador que
 * codifica WebP, estava em 117 kB.
 *
 * Daí a queda para JPEG antes de aceitar PNG: para fotografia o JPEG fica perto
 * do WebP em tamanho, e é codificável em qualquer navegador que rode este
 * painel. E daí o `ext`/`contentType` saírem do blob que voltou, nunca do que
 * foi pedido — arquivo com nome de um formato e bytes de outro foi justamente o
 * que escondeu o problema por meses.
 */
export async function resizeImage(file: File, maxEdge: number, quality = 0.82): Promise<ImagemRedimensionada> {
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

    let blob = await toBlob(canvas, 'image/webp', quality)
    if (blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality)

    return { blob, ext: EXTENSAO[blob.type] ?? 'png', contentType: blob.type }
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
 * Testando como alternativa às derivadas `urlSm` geradas no upload: uma foto
 * só, redimensionada sob demanda pro Supabase, em vez de duas subidas fixas.
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
