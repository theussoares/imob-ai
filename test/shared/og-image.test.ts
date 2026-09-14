import { describe, expect, test } from 'vitest'
import { homeOgImage, homeOgUrl, ogVersion, propertyOgUrl } from '~~/shared/utils/og-image'

const comFoto = (url: string) => ({ images: [{ url }] })

describe('homeOgImage', () => {
  // O hero passou à frente da logo porque é uma FOTO: preenche o card social
  // inteiro, enquanto a logo vira uma marca pequena no meio de um retângulo.
  test('o hero da imobiliária vem primeiro', () => {
    const img = homeOgImage({ heroImage: 'https://cdn/hero.webp', logoUrl: 'https://cdn/logo.webp' }, [
      comFoto('https://cdn/casa.webp'),
    ])

    expect(img).toBe('https://cdn/hero.webp')
  })

  test('sem hero, cai na capa do primeiro imóvel — não na logo', () => {
    const img = homeOgImage({ heroImage: null, logoUrl: 'https://cdn/logo.webp' }, [
      comFoto('https://cdn/casa.webp'),
      comFoto('https://cdn/apto.webp'),
    ])

    expect(img).toBe('https://cdn/casa.webp')
  })

  test('sem hero e sem imóvel com foto, a logo é o último recurso', () => {
    expect(homeOgImage({ logoUrl: 'https://cdn/logo.webp' }, [])).toBe('https://cdn/logo.webp')
  })

  // O tenant `demo` tem logo_url = "" (string vazia), não null. Tratar só null
  // deixaria a home dele anunciando uma imagem que não existe.
  test('string vazia conta como ausente', () => {
    const img = homeOgImage({ heroImage: '', logoUrl: '' }, [comFoto('https://cdn/casa.webp')])

    expect(img).toBe('https://cdn/casa.webp')
  })

  test('só com espaços também conta como ausente', () => {
    expect(homeOgImage({ heroImage: '   ' }, [comFoto('https://cdn/casa.webp')])).toBe('https://cdn/casa.webp')
  })

  // Imóvel sem foto cadastrada existe: a lista traz `images: []`. Pular para o
  // próximo é melhor que desistir quando há foto logo abaixo.
  test('pula imóvel sem capa e usa o próximo que tiver', () => {
    const img = homeOgImage(null, [{ images: [] }, comFoto('https://cdn/apto.webp')])

    expect(img).toBe('https://cdn/apto.webp')
  })

  test('sem tenant e sem imóvel nenhum, não há foto de origem', () => {
    expect(homeOgImage(null, [])).toBeUndefined()
  })

  test('nenhum imóvel com capa e nenhuma imagem de marca', () => {
    expect(homeOgImage({ heroImage: null, logoUrl: null }, [{ images: [] }, { images: [] }])).toBeUndefined()
  })
})

describe('ogVersion', () => {
  // O WhatsApp guarda o preview POR URL e não revalida. Se o hash não mudar
  // junto com a foto, trocar a capa no painel não muda o preview — foi para isso
  // que o `?v=` existe.
  test('fotos diferentes geram versões diferentes', () => {
    expect(ogVersion('https://cdn/a.webp')).not.toBe(ogVersion('https://cdn/b.webp'))
  })

  test('a mesma foto gera sempre a mesma versão', () => {
    expect(ogVersion('https://cdn/a.webp')).toBe(ogVersion('https://cdn/a.webp'))
  })

  test('sem foto de origem ainda devolve uma versão utilizável', () => {
    expect(ogVersion(null)).toMatch(/^[a-z0-9]+$/)
    expect(ogVersion(undefined)).toBe(ogVersion(null))
  })
})

describe('URLs do card', () => {
  // og:image relativo é ignorado por boa parte dos crawlers.
  test('a URL da home é absoluta, no host da requisição', () => {
    const url = homeOgUrl('https://tpimobiliaria.com.br', 'https://cdn/hero.webp')

    expect(url).toBe(`https://tpimobiliaria.com.br/og/home.jpg?v=${ogVersion('https://cdn/hero.webp')}`)
  })

  // A extensão .jpg não é decorativa: leitores de preview (o do WhatsApp
  // inclusive) desconfiam de og:image sem extensão de imagem.
  test('a URL do imóvel carrega o código e termina em .jpg', () => {
    const url = propertyOgUrl('https://tpimobiliaria.com.br', 'VD-0019', 'https://cdn/capa.webp')

    expect(url).toBe(
      `https://tpimobiliaria.com.br/og/imovel/VD-0019.jpg?v=${ogVersion('https://cdn/capa.webp')}`,
    )
  })

  test('código com caractere especial não quebra a URL', () => {
    expect(propertyOgUrl('https://x.com.br', 'VD 19/A', null)).toContain('/og/imovel/VD%2019%2FA.jpg?v=')
  })
})
