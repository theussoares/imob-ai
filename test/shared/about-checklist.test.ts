import { describe, expect, test } from 'vitest'
import { recommendedAboutBlocks } from '~~/shared/models/about-page'
import { aboutChecklist } from '~~/shared/utils/about-checklist'
import { sanitizeAboutContent } from '~~/shared/utils/about-content'

const ok = (content: unknown, corretores: number | null = 3) =>
  Object.fromEntries(aboutChecklist(content, corretores).map((i) => [i.key, i.ok]))

const IMG = 'https://cdn.exemplo.com/a.webp'

describe('aboutChecklist', () => {
  test('página completa marca tudo', () => {
    expect(
      ok({
        blocks: [
          { type: 'stat', value: '18 anos', label: 'de mercado' },
          { type: 'split', imageUrl: IMG, imageAlt: 'Fachada da sede', title: 'Nossa história', body: 'Começamos em 2008.' },
          { type: 'team', title: '' },
          { type: 'testimonial', quote: 'Ótimo atendimento.', authorName: 'Ana', authorRole: '' },
        ],
      }),
    ).toEqual({ historia: true, numeros: true, equipe: true, depoimento: true, descricoes: true })
  })

  // O bloco renderiza nada sem corretor público — o site perde a seção em
  // silêncio. O checklist é o único lugar que avisa.
  test('bloco de equipe sem corretor público é pendência, com o motivo', () => {
    const itens = aboutChecklist({ blocks: [{ type: 'team', title: '' }] }, 0)
    const equipe = itens.find((i) => i.key === 'equipe')!
    expect(equipe.ok).toBe(false)
    expect(equipe.label).toMatch(/nenhum corretor/)
  })

  test('enquanto a contagem carrega, não acusa equipe vazia', () => {
    expect(ok({ blocks: [{ type: 'team', title: '' }] }, null).equipe).toBe(true)
  })

  // Avalia o que o site mostra: depoimento sem nome é descartado lá.
  test('bloco incompleto não conta como presente', () => {
    expect(ok({ blocks: [{ type: 'testimonial', quote: 'Ótimo.', authorName: '', authorRole: '' }] }).depoimento).toBe(false)
  })

  test('conta imagens sem descrição em foto, split, galeria e logos — não no fundo do banner', () => {
    const itens = aboutChecklist(
      {
        blocks: [
          { type: 'image', url: IMG, alt: '', caption: '' },
          { type: 'gallery', images: [{ url: IMG, alt: 'Escritório' }, { url: IMG, alt: '' }] },
          { type: 'banner', title: 'Chamada', imageUrl: IMG, ctaLabel: '', ctaHref: '' },
        ],
      },
      1,
    )
    const descricoes = itens.find((i) => i.key === 'descricoes')!
    expect(descricoes.ok).toBe(false)
    expect(descricoes.label).toMatch(/^2 imagens/)
  })
})

describe('recommendedAboutBlocks', () => {
  // A ameaça: texto-exemplo esquecido no modelo vira conteúdo falso no site do
  // cliente. Os blocos do modelo só podem sobreviver à sanitização quando não
  // carregam conteúdo — `team`, que só aponta para o cadastro de corretores.
  test('nada do modelo chega ao site sem a pessoa escrever', () => {
    const publicado = sanitizeAboutContent({ blocks: recommendedAboutBlocks().map((t) => t.block) })
    expect(publicado.blocks).toEqual([{ type: 'team', title: '' }])
  })

  test('cada chamada devolve objetos novos', () => {
    const a = recommendedAboutBlocks()
    const b = recommendedAboutBlocks()
    expect(a[0]!.block).not.toBe(b[0]!.block)
    expect(a[0]!.block).not.toBe(a[1]!.block)
  })
})
