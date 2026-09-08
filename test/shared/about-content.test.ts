import { describe, expect, test } from 'vitest'
import { ABOUT_BLOCKS_MAX, GALLERY_IMAGES_MAX, LOGOS_MAX, sanitizeAboutContent } from '~~/shared/utils/about-content'

describe('sanitizeAboutContent', () => {
  test('mantém blocos válidos de cada tipo, já aparados', () => {
    expect(
      sanitizeAboutContent({
        blocks: [
          { type: 'heading', text: '  Nossa história  ' },
          { type: 'text', body: '  Fundada em 2005...  ' },
          { type: 'image', url: 'https://cdn.exemplo.com/foto.webp', alt: ' Equipe ', caption: '' },
          { type: 'stat', value: ' 20 anos ', label: ' de mercado ' },
        ],
      }),
    ).toEqual({
      blocks: [
        { type: 'heading', text: 'Nossa história' },
        { type: 'text', body: 'Fundada em 2005...' },
        { type: 'image', url: 'https://cdn.exemplo.com/foto.webp', alt: 'Equipe', caption: '' },
        { type: 'stat', value: '20 anos', label: 'de mercado' },
      ],
    })
  })

  test('descarta bloco de tipo desconhecido em vez de recusar a página inteira', () => {
    expect(
      sanitizeAboutContent({
        blocks: [
          { type: 'heading', text: 'Título' },
          { type: 'timeline', text: 'não existe' },
        ],
      }),
    ).toEqual({ blocks: [{ type: 'heading', text: 'Título' } ] })
  })

  test('descarta heading/text vazios — apareceriam como espaço em branco', () => {
    expect(sanitizeAboutContent({ blocks: [{ type: 'heading', text: '   ' }, { type: 'text', body: '' }] })).toEqual({
      blocks: [],
    })
  })

  test('descarta imagem sem URL http(s) — nunca um esquema executável', () => {
    expect(
      sanitizeAboutContent({
        blocks: [
          { type: 'image', url: 'javascript:alert(1)', alt: 'x', caption: '' },
          { type: 'image', url: '/relativo.png', alt: 'x', caption: '' },
        ],
      }),
    ).toEqual({ blocks: [] })
  })

  test('descarta stat sem valor ou sem rótulo', () => {
    expect(
      sanitizeAboutContent({
        blocks: [
          { type: 'stat', value: '20', label: '' },
          { type: 'stat', value: '', label: 'anos' },
        ],
      }),
    ).toEqual({ blocks: [] })
  })

  test('respeita o teto de blocos', () => {
    const muitos = Array.from({ length: ABOUT_BLOCKS_MAX + 10 }, (_, i) => ({ type: 'heading', text: `Bloco ${i}` }))
    expect(sanitizeAboutContent({ blocks: muitos }).blocks).toHaveLength(ABOUT_BLOCKS_MAX)
  })

  test('tolera lixo vindo do banco ou do body', () => {
    expect(sanitizeAboutContent(null)).toEqual({ blocks: [] })
    expect(sanitizeAboutContent('nada disso')).toEqual({ blocks: [] })
    expect(sanitizeAboutContent({ blocks: 'nada disso' })).toEqual({ blocks: [] })
    expect(sanitizeAboutContent({ blocks: [1, 'a', null, { type: 'heading' }] })).toEqual({ blocks: [] })
  })

  test('banner: mantém com título e imagem, some o CTA incompleto', () => {
    expect(
      sanitizeAboutContent({
        blocks: [
          {
            type: 'banner',
            title: ' 20 anos cuidando de quem confia ',
            imageUrl: 'https://cdn.exemplo.com/banner.webp',
            ctaLabel: 'Fale com a gente',
            ctaHref: '',
          },
        ],
      }),
    ).toEqual({
      blocks: [
        {
          type: 'banner',
          title: '20 anos cuidando de quem confia',
          imageUrl: 'https://cdn.exemplo.com/banner.webp',
          ctaLabel: '',
          ctaHref: '',
        },
      ],
    })
  })

  test('banner: descarta sem título e sem imagem', () => {
    expect(sanitizeAboutContent({ blocks: [{ type: 'banner', title: '', imageUrl: '', ctaLabel: '', ctaHref: '' }] })).toEqual({
      blocks: [],
    })
  })

  test('split: mantém com só texto, sem imagem; some quando tudo vazio', () => {
    expect(
      sanitizeAboutContent({ blocks: [{ type: 'split', imageUrl: '', imageAlt: '', title: 'Nossa história', body: '', imagePosition: 'left' }] }),
    ).toEqual({ blocks: [{ type: 'split', imageUrl: '', imageAlt: '', title: 'Nossa história', body: '', imagePosition: 'left' }] })

    expect(
      sanitizeAboutContent({ blocks: [{ type: 'split', imageUrl: '', imageAlt: '', title: '', body: '', imagePosition: 'esquerda' }] }),
    ).toEqual({ blocks: [] })
  })

  test('split: posição inválida cai no padrão "right"', () => {
    const [bloco] = sanitizeAboutContent({
      blocks: [{ type: 'split', imageUrl: '', imageAlt: '', title: 'X', body: '', imagePosition: 'cima' }],
    }).blocks
    expect(bloco).toMatchObject({ imagePosition: 'right' })
  })

  test('gallery: descarta item sem URL http(s) e some o bloco se sobrar vazio', () => {
    expect(
      sanitizeAboutContent({
        blocks: [{ type: 'gallery', images: [{ url: 'javascript:alert(1)', alt: 'x' }, { url: '/relativo.png', alt: 'y' }] }],
      }),
    ).toEqual({ blocks: [] })

    expect(
      sanitizeAboutContent({
        blocks: [{ type: 'gallery', images: [{ url: 'https://cdn.exemplo.com/a.webp', alt: 'A' }] }],
      }),
    ).toEqual({ blocks: [{ type: 'gallery', images: [{ url: 'https://cdn.exemplo.com/a.webp', alt: 'A' }] }] })
  })

  test('gallery: respeita o teto de fotos por bloco', () => {
    const muitas = Array.from({ length: GALLERY_IMAGES_MAX + 5 }, (_, i) => ({ url: `https://cdn.exemplo.com/${i}.webp`, alt: `${i}` }))
    const [bloco] = sanitizeAboutContent({ blocks: [{ type: 'gallery', images: muitas }] }).blocks
    expect(bloco).toMatchObject({ type: 'gallery' })
    expect((bloco as { images: unknown[] }).images).toHaveLength(GALLERY_IMAGES_MAX)
  })

  test('testimonial: exige depoimento e nome do autor', () => {
    expect(
      sanitizeAboutContent({ blocks: [{ type: 'testimonial', quote: 'Atendimento excelente', authorName: 'Maria', authorRole: '' }] }),
    ).toEqual({ blocks: [{ type: 'testimonial', quote: 'Atendimento excelente', authorName: 'Maria', authorRole: '' }] })

    expect(sanitizeAboutContent({ blocks: [{ type: 'testimonial', quote: '', authorName: 'Maria', authorRole: '' }] })).toEqual({
      blocks: [],
    })
    expect(sanitizeAboutContent({ blocks: [{ type: 'testimonial', quote: 'Ótimo', authorName: '', authorRole: '' }] })).toEqual({
      blocks: [],
    })
  })

  test('logos: mesma regra da galeria, com teto próprio menor', () => {
    const muitos = Array.from({ length: LOGOS_MAX + 3 }, (_, i) => ({ url: `https://cdn.exemplo.com/logo${i}.png`, alt: `${i}` }))
    const [bloco] = sanitizeAboutContent({ blocks: [{ type: 'logos', items: muitos }] }).blocks
    expect((bloco as { items: unknown[] }).items).toHaveLength(LOGOS_MAX)
  })

  test('team: sempre válido, mesmo sem título — é bloco dinâmico', () => {
    expect(sanitizeAboutContent({ blocks: [{ type: 'team', title: '' }] })).toEqual({ blocks: [{ type: 'team', title: '' }] })
    expect(sanitizeAboutContent({ blocks: [{ type: 'team', title: ' Conheça o time ' }] })).toEqual({
      blocks: [{ type: 'team', title: 'Conheça o time' }],
    })
  })
})
