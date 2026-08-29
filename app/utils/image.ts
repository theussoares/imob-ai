/**
 * Redimensiona e converte imagens para WebP no próprio navegador, antes do
 * upload. Sem isto, a foto original do celular (3–4 MB, 3000×4000) vai crua pro
 * Storage e é servida assim até num thumbnail de 84×60 — era o maior custo de
 * bytes do site.
 */

/** Lado maior das derivadas geradas para cada foto de imóvel. */
export const IMAGE_SIZE_LG = 1600
export const IMAGE_SIZE_SM = 640

/**
 * Reduz a imagem para caber em `maxEdge` (preservando proporção) e devolve WebP.
 * Nunca amplia: imagem menor que o alvo é só convertida.
 */
export async function resizeToWebp(file: File, maxEdge: number, quality = 0.82): Promise<Blob> {
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    )
    if (!blob) throw new Error('Falha ao converter a imagem para WebP.')
    return blob
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
