import { describe, expect, test } from 'vitest'
import { groupAboutBlocks } from '~~/shared/utils/about-render'

/**
 * A ameaça é a página salva no formato antigo (um número ou um depoimento por
 * bloco) mudar de cara — ou quebrar — quando o painel passou a criar blocos
 * com itens. Não houve migração de dado: quem garante a compatibilidade é este
 * agrupamento.
 */
describe('groupAboutBlocks', () => {
  test('números antigos consecutivos viram UMA faixa, como antes', () => {
    expect(
      groupAboutBlocks([
        { type: 'stat', value: '18 anos', label: 'de mercado' },
        { type: 'stat', value: '1.200', label: 'famílias' },
        { type: 'heading', text: 'História' },
        { type: 'stat', value: '3', label: 'cidades' },
      ]),
    ).toEqual([
      { kind: 'stats', items: [{ value: '18 anos', label: 'de mercado' }, { value: '1.200', label: 'famílias' }] },
      { kind: 'block', block: { type: 'heading', text: 'História' } },
      { kind: 'stats', items: [{ value: '3', label: 'cidades' }] },
    ])
  })

  test('depoimentos antigos consecutivos viram uma grade', () => {
    const d = (authorName: string) => ({ type: 'testimonial' as const, quote: 'Bom', authorName, authorRole: '' })
    expect(groupAboutBlocks([d('Ana'), d('Bruno')])).toEqual([
      {
        kind: 'testimonials',
        items: [
          { quote: 'Bom', authorName: 'Ana', authorRole: '' },
          { quote: 'Bom', authorName: 'Bruno', authorRole: '' },
        ],
      },
    ])
  })

  test('formato novo e antigo desenham o mesmo grupo', () => {
    const antigo = groupAboutBlocks([
      { type: 'stat', value: '18 anos', label: 'de mercado' },
      { type: 'stat', value: '3', label: 'cidades' },
    ])
    const novo = groupAboutBlocks([
      { type: 'stats', items: [{ value: '18 anos', label: 'de mercado' }, { value: '3', label: 'cidades' }] },
    ])
    expect(novo).toEqual(antigo)
  })

  test('dois blocos novos seguidos continuam separados — foi escolha de quem editou', () => {
    const faixa = { type: 'stats' as const, items: [{ value: '1', label: 'x' }] }
    expect(groupAboutBlocks([faixa, faixa])).toHaveLength(2)
  })

  test('não altera os blocos recebidos (a prévia do painel passa o rascunho)', () => {
    const itens = [{ value: '1', label: 'x' }]
    const blocks = [{ type: 'stats' as const, items: itens }, { type: 'stat' as const, value: '2', label: 'y' }]
    groupAboutBlocks(blocks)
    expect(itens).toHaveLength(1)
  })
})
