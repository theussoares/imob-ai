import { describe, expect, test } from 'vitest'
import { ABOUT_BLOCKS_MAX, sanitizeAboutContent } from '~~/shared/utils/about-content'

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
})
