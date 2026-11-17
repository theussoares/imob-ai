import { describe, expect, it } from 'vitest'
import { adicionarFotos, definirCapa, FOTO_TAMANHO_MAX, FOTOS_IMOVEL_MAX, moverFoto, removerFoto } from '../../domain/imoveis-fotos'

const img = (n = 1) => ({ url: `data:image/jpeg;base64,${'A'.repeat(n)}`, alt: null })
const sequencia = () => {
  let n = 0
  return () => `f${++n}`
}
const tres = () => {
  const r = adicionarFotos([], [img(), img(2), img(3)], sequencia())
  if (!r.ok) throw new Error(r.erro)
  return r.fotos
}

describe('adicionarFotos', () => {
  it('a primeira foto vira capa e as posições são sequenciais a partir de 0', () => {
    const f = tres()
    expect(f.map((x) => x.id)).toEqual(['f1', 'f2', 'f3'])
    expect(f.map((x) => x.position)).toEqual([0, 1, 2])
    expect(f.map((x) => x.isCover)).toEqual([true, false, false])
  })

  it('não passa de 6 fotos e deixa a lista intacta', () => {
    const f = tres()
    const r = adicionarFotos(f, [img(), img(), img(), img()], sequencia())
    expect(FOTOS_IMOVEL_MAX).toBe(6)
    expect(r).toEqual({ ok: false, erro: 'Cada imóvel aceita no máximo 6 fotos.' })
  })

  it('recusa o que não é imagem e a foto grande demais', () => {
    expect(adicionarFotos([], [{ url: 'https://x.com/a.jpg', alt: null }], sequencia())).toEqual({ ok: false, erro: 'O arquivo precisa ser uma imagem.' })
    expect(adicionarFotos([], [img(FOTO_TAMANHO_MAX)], sequencia())).toEqual({ ok: false, erro: 'A foto é grande demais depois de reduzida.' })
  })
})

describe('capa, ordem e remoção', () => {
  it('definirCapa deixa uma só capa', () => {
    const f = definirCapa(tres(), 'f3')
    expect(f.filter((x) => x.isCover).map((x) => x.id)).toEqual(['f3'])
  })

  it('remover a capa promove a primeira restante e renumera', () => {
    const f = removerFoto(tres(), 'f1')
    expect(f.map((x) => [x.id, x.position, x.isCover])).toEqual([['f2', 0, true], ['f3', 1, false]])
  })

  it('mover troca de lugar e, na ponta, não muda nada', () => {
    expect(moverFoto(tres(), 'f2', 'cima').map((x) => x.id)).toEqual(['f2', 'f1', 'f3'])
    expect(moverFoto(tres(), 'f1', 'cima').map((x) => x.id)).toEqual(['f1', 'f2', 'f3'])
    expect(moverFoto(tres(), 'f3', 'baixo').map((x) => x.position)).toEqual([0, 1, 2])
  })
})
