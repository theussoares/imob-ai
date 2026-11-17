import type { FotoNova } from '../../domain/imoveis-fotos'

const LADO_MAXIMO = 1280
const QUALIDADE = 0.7

/**
 * Reduz a foto no navegador antes de guardar. No demo ela mora no localStorage (~5 MB para o painel
 * todo), então o original de celular (vários MB) não cabe; no backend o arquivo vai para o Storage.
 * É o único lugar do painel que usa `canvas`.
 */
export function useRedimensionarFoto() {
  async function reduzir(arquivo: File): Promise<FotoNova | { erro: string }> {
    if (!arquivo.type.startsWith('image/')) return { erro: 'O arquivo precisa ser uma imagem.' }
    try {
      const bitmap = await createImageBitmap(arquivo)
      const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * escala)
      canvas.height = Math.round(bitmap.height * escala)
      const ctx = canvas.getContext('2d')
      if (!ctx) return { erro: 'Não foi possível ler esta imagem.' }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      return { url: canvas.toDataURL('image/jpeg', QUALIDADE), alt: null }
    } catch {
      return { erro: 'Não foi possível ler esta imagem.' }
    }
  }

  return { reduzir }
}
