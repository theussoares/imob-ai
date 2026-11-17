import type { FotoNova } from '../../domain/imoveis-fotos'

/**
 * Prepara a foto para guardar com a MESMA redução do `/admin` (`resizeForUpload` em `app/utils/image.ts`):
 * duas versões, 1600 px (`url`) e 640 px (`urlSm`), em WebP, ou JPEG onde o navegador não codifica WebP.
 * Foto de celular (3–4 MB) nunca segue crua para o Storage. Aqui as versões viram data URL porque o mock
 * guarda no localStorage; no backend, os mesmos dois blobs sobem para o bucket `property-images`.
 *
 * Formato que o canvas não abre (SVG, HEIC) é recusado: o `/admin` o enviaria cru e sem versão pequena,
 * e é exatamente o que esta redução existe para evitar.
 */
const paraDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(String(leitor.result))
    leitor.onerror = () => reject(leitor.error)
    leitor.readAsDataURL(blob)
  })

export function useRedimensionarFoto() {
  async function reduzir(arquivo: File): Promise<FotoNova | { erro: string }> {
    if (!isResizableImage(arquivo)) return { erro: 'Use fotos em JPG, PNG ou WebP.' }
    try {
      const [grande, pequena] = await Promise.all([
        resizeForUpload(arquivo, IMAGE_SIZE_LG, 'image/jpeg'),
        resizeForUpload(arquivo, IMAGE_SIZE_SM, 'image/jpeg'),
      ])
      const [url, urlSm] = await Promise.all([paraDataUrl(grande.blob), paraDataUrl(pequena.blob)])
      return { url, urlSm, alt: null }
    } catch {
      return { erro: 'Não foi possível ler esta imagem.' }
    }
  }

  return { reduzir }
}
