import { describe, expect, test } from 'vitest'
import { buildSearchLeadMessage, searchCriteriaParts } from '~~/shared/utils/search-lead'

const base = { purpose: 'venda' as const, q: '', type: '' as const, bedrooms: 0, maxPrice: 0 }

describe('searchCriteriaParts', () => {
  test('descreve só os filtros que a pessoa realmente usou', () => {
    // O valor de um formulário no catálogo vazio é justamente não pedir de novo
    // o que ela já informou. Listar filtro não usado inventaria critério.
    expect(searchCriteriaParts(base)).toEqual([])
  })

  test('diz que quartos é mínimo, não exato', () => {
    // O filtro é `bedrooms >= n`. Escrever "3 quartos" faria o corretor procurar
    // exatamente 3 e descartar o de 4, que serviria.
    expect(searchCriteriaParts({ ...base, bedrooms: 3 })).toEqual(['a partir de 3 quartos'])
    expect(searchCriteriaParts({ ...base, bedrooms: 1 })).toEqual(['a partir de 1 quarto'])
  })

  test('formata o teto de preço em reais', () => {
    expect(searchCriteriaParts({ ...base, maxPrice: 400000 })).toEqual(['até R$ 400.000'])
  })

  test('usa o rótulo do tipo, não o valor do banco', () => {
    expect(searchCriteriaParts({ ...base, type: 'apartamento' })).toEqual(['apartamento'])
  })

  test('inclui o texto buscado como termo, deixando claro que foi busca livre', () => {
    expect(searchCriteriaParts({ ...base, q: 'Centro' })).toEqual(['buscando por "Centro"'])
  })

  test('mantém a ordem: tipo, quartos, preço, termo', () => {
    expect(
      searchCriteriaParts({ purpose: 'venda', q: 'Centro', type: 'casa', bedrooms: 3, maxPrice: 400000 }),
    ).toEqual(['casa', 'a partir de 3 quartos', 'até R$ 400.000', 'buscando por "Centro"'])
  })
})

describe('buildSearchLeadMessage', () => {
  test('abre dizendo a intenção, que é o que muda o atendimento', () => {
    expect(buildSearchLeadMessage(base)).toBe('Procura imóvel para comprar')
    expect(buildSearchLeadMessage({ ...base, purpose: 'aluguel' })).toBe('Procura imóvel para alugar')
  })

  test('junta os critérios numa linha legível no card do funil', () => {
    expect(
      buildSearchLeadMessage({ purpose: 'venda', q: 'Centro', type: 'casa', bedrooms: 3, maxPrice: 400000 }),
    ).toBe('Procura imóvel para comprar · casa · a partir de 3 quartos · até R$ 400.000 · buscando por "Centro"')
  })

  test('acrescenta a observação depois dos critérios', () => {
    expect(buildSearchLeadMessage({ ...base, bedrooms: 2 }, 'Preciso de garagem coberta.')).toBe(
      'Procura imóvel para comprar · a partir de 2 quartos — Preciso de garagem coberta.',
    )
  })

  test('sem filtro nenhum ainda diz algo útil', () => {
    // Quem clica no fim do catálogo pode não ter filtrado nada. O lead não pode
    // chegar com a mensagem vazia.
    expect(buildSearchLeadMessage(base, '')).toBe('Procura imóvel para comprar')
  })
})
