import { describe, expect, test } from 'vitest'
import { encodeWithFallback } from '~~/app/utils/image'

// A ameaça: o navegador que não codifica WebP devolve PNG sem erro, e o
// arquivo sobe com nome e contentType de WebP. Foi assim que os cards da Olmi
// passaram de 40 KB para 500 KB sem ninguém notar — a imagem abre normal.

/** Imita `canvas.toBlob`: devolve o tipo que o "navegador" sabe gerar. */
function navegador(sabe: string[]) {
  const pedidos: string[] = []
  const encode = async (type: string) => {
    pedidos.push(type)
    return new Blob(['x'], { type: sabe.includes(type) ? type : 'image/png' })
  }
  return { encode, pedidos }
}

describe('encodeWithFallback', () => {
  test('navegador com WebP: sobe WebP, sem segunda codificação', async () => {
    const { encode, pedidos } = navegador(['image/webp', 'image/jpeg'])
    const r = await encodeWithFallback(encode, 'image/jpeg', 0.82)
    expect(r).toMatchObject({ ext: 'webp', contentType: 'image/webp' })
    expect(pedidos).toEqual(['image/webp'])
  })

  test('Safari (sem WebP): foto cai para JPEG, nunca para o PNG que ele devolveu', async () => {
    const { encode } = navegador(['image/jpeg'])
    const r = await encodeWithFallback(encode, 'image/jpeg', 0.82)
    expect(r.contentType).toBe('image/jpeg')
    expect(r.ext).toBe('jpg')
    expect(r.blob.type).toBe('image/jpeg')
  })

  test('logo sem WebP cai para PNG, que preserva transparência', async () => {
    const { encode } = navegador([])
    const r = await encodeWithFallback(encode, 'image/png', 0.82)
    expect(r).toMatchObject({ ext: 'png', contentType: 'image/png' })
  })

  test('a extensão sempre corresponde ao tipo real do blob', async () => {
    for (const sabe of [['image/webp'], ['image/jpeg'], []]) {
      for (const fallback of ['image/jpeg', 'image/png'] as const) {
        const { encode } = navegador(sabe)
        const r = await encodeWithFallback(encode, fallback, 0.82).catch(() => null)
        if (r) expect(r.blob.type).toBe(r.contentType)
      }
    }
  })

  test('se nem o fallback vier no tipo pedido, recusa em vez de subir errado', async () => {
    const encode = async () => new Blob(['x'], { type: 'image/png' })
    await expect(encodeWithFallback(encode, 'image/jpeg', 0.82)).rejects.toThrow()
  })

  test('canvas que devolve null também é recusado', async () => {
    const encode = async () => null
    await expect(encodeWithFallback(encode, 'image/jpeg', 0.82)).rejects.toThrow()
  })
})
