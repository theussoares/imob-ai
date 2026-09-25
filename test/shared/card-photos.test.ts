import { describe, expect, test } from 'vitest'
import type { PropertyImage } from '~~/shared/models/property'
import { enxugarCards, enxugarFotosDoCard } from '~~/shared/utils/card-photos'
import { homeOgImage } from '~~/shared/utils/og-image'

// A ameaça é dupla. Deixar campo sobrando infla o payload da home — 163 KB
// medidos em 24/09 para 12 cards visíveis, 72% em fotos. E cortar demais
// apaga uma foto do card ou a imagem de compartilhamento da home, sem erro
// nenhum: a página continua renderizando, só que sem a foto.

const foto = (n: number, sm: boolean = true): PropertyImage => ({
  id: `id-${n}`,
  url: `https://x.supabase.co/storage/v1/object/public/property-images/olmi/${n}.webp`,
  urlSm: sm ? `https://x.supabase.co/storage/v1/object/public/property-images/olmi/${n}@sm.webp` : null,
  alt: `foto ${n}`,
  position: n,
  isCover: n === 0,
})

describe('enxugarFotosDoCard', () => {
  test('a capa guarda as duas derivadas; as demais, só a pequena', () => {
    const r = enxugarFotosDoCard([foto(0), foto(1), foto(2)])
    expect(r[0]).toEqual({ url: foto(0).url, urlSm: foto(0).urlSm })
    expect(r[1]).toEqual({ url: foto(1).urlSm })
    expect(r[2]).toEqual({ url: foto(2).urlSm })
  })

  test('foto que não passou pelo uploader (sem urlSm) não perde o endereço', () => {
    const r = enxugarFotosDoCard([foto(0, false), foto(1, false)])
    expect(r[0]).toEqual({ url: foto(0).url, urlSm: null })
    expect(r[1]).toEqual({ url: foto(1).url })
  })

  test('nenhuma foto some e a ordem se mantém (capa em [0])', () => {
    const entrada = [foto(0), foto(1), foto(2), foto(3), foto(4)]
    const r = enxugarFotosDoCard(entrada)
    expect(r).toHaveLength(5)
    expect(r.map((f) => f.urlSm || f.url)).toEqual(entrada.map((f) => f.urlSm || f.url))
  })

  test('sai só com os campos que o card lê', () => {
    for (const f of enxugarFotosDoCard([foto(0), foto(1)])) {
      expect(Object.keys(f).every((k) => k === 'url' || k === 'urlSm')).toBe(true)
    }
  })

  test('imóvel sem foto continua sem foto', () => {
    expect(enxugarFotosDoCard([])).toEqual([])
  })
})

describe('enxugarCards', () => {
  test('a imagem de compartilhamento da home continua a mesma', () => {
    const cards = [{ images: [] as PropertyImage[] }, { images: [foto(0), foto(1)] }]
    expect(homeOgImage(null, enxugarCards(cards))).toBe(homeOgImage(null, cards))
    expect(homeOgImage(null, enxugarCards(cards))).toBe(foto(0).url)
  })

  test('não mexe nos outros campos do card', () => {
    const card = { code: 'VD-1', price: 500000, images: [foto(0)] }
    const [r] = enxugarCards([card])
    expect(r).toMatchObject({ code: 'VD-1', price: 500000 })
    expect(card.images[0]).toHaveProperty('id') // não muta a entrada
  })
})
