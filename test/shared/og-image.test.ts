import { describe, expect, test } from 'vitest'
import { homeOgImage } from '~~/shared/utils/og-image'

const comFoto = (url: string) => ({ images: [{ url }] })

describe('homeOgImage', () => {
  test('a logo da imobiliária vem primeiro', () => {
    const img = homeOgImage('https://cdn/logo.webp', [comFoto('https://cdn/casa.webp')])

    expect(img).toBe('https://cdn/logo.webp')
  })

  test('sem logo, cai na capa do primeiro imóvel', () => {
    const img = homeOgImage(null, [comFoto('https://cdn/casa.webp'), comFoto('https://cdn/apto.webp')])

    expect(img).toBe('https://cdn/casa.webp')
  })

  // O tenant `demo` tem logo_url = "" (string vazia), não null. Tratar só null
  // deixaria a home dele anunciando uma imagem que não existe.
  test('logo vazia conta como ausente', () => {
    const img = homeOgImage('', [comFoto('https://cdn/casa.webp')])

    expect(img).toBe('https://cdn/casa.webp')
  })

  test('logo só com espaços também conta como ausente', () => {
    expect(homeOgImage('   ', [comFoto('https://cdn/casa.webp')])).toBe('https://cdn/casa.webp')
  })

  // Imóvel sem foto cadastrada existe: a lista traz `images: []`. Pular para o
  // próximo é melhor que anunciar nada quando há foto logo abaixo.
  test('pula imóvel sem capa e usa o próximo que tiver', () => {
    const img = homeOgImage(null, [{ images: [] }, comFoto('https://cdn/apto.webp')])

    expect(img).toBe('https://cdn/apto.webp')
  })

  test('sem logo e sem imóvel nenhum, não anuncia imagem', () => {
    expect(homeOgImage(null, [])).toBeUndefined()
  })

  test('sem logo e nenhum imóvel com capa, não anuncia imagem', () => {
    expect(homeOgImage(null, [{ images: [] }, { images: [] }])).toBeUndefined()
  })
})
