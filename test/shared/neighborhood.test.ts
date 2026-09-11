import { describe, expect, test } from 'vitest'
import {
  qualifyingNeighborhoods,
  findNeighborhood,
  propertiesInNeighborhood,
} from '~~/shared/utils/neighborhood'

describe('agrupamento de bairro', () => {
  // O caso real que motivou o normalizador: "Mais Parque", "Mais parque " e
  // "Mais Parque " (variações de maiúscula/espaço do mesmo cadastro manual)
  // não podem virar três grupos de 1 imóvel cada.
  test('variações de maiúscula/espaço do mesmo bairro se juntam', () => {
    const itens = [
      { neighborhood: 'Mais Parque' },
      { neighborhood: 'Mais parque ' },
      { neighborhood: 'Mais Parque ' },
    ]
    const grupos = qualifyingNeighborhoods(itens)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]).toMatchObject({ slug: 'mais-parque', label: 'Mais Parque', count: 3 })
  })

  test('abaixo do piso não qualifica', () => {
    const itens = [{ neighborhood: 'Vila Haro' }, { neighborhood: 'Vila Haro' }]
    expect(qualifyingNeighborhoods(itens)).toHaveLength(0)
  })

  test('bairro vazio ou nulo é ignorado', () => {
    const itens = [
      { neighborhood: '' },
      { neighborhood: null },
      { neighborhood: 'Centro' },
      { neighborhood: 'Centro' },
      { neighborhood: 'Centro' },
    ]
    const grupos = qualifyingNeighborhoods(itens)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].count).toBe(3)
  })

  test('ordena por quantidade, maior primeiro', () => {
    const itens = [
      { neighborhood: 'A' },
      { neighborhood: 'A' },
      { neighborhood: 'A' },
      { neighborhood: 'B' },
      { neighborhood: 'B' },
      { neighborhood: 'B' },
      { neighborhood: 'B' },
    ]
    const grupos = qualifyingNeighborhoods(itens)
    expect(grupos.map((g) => g.slug)).toEqual(['b', 'a'])
  })

  test('findNeighborhood resolve o slug só se qualificar', () => {
    const itens = [{ neighborhood: 'Centro' }, { neighborhood: 'Centro' }, { neighborhood: 'Centro' }]
    expect(findNeighborhood(itens, 'centro')).toMatchObject({ slug: 'centro', count: 3 })
    expect(findNeighborhood(itens, 'bairro-inexistente')).toBeNull()
  })
})

describe('imóveis de um bairro', () => {
  test('filtra por slug normalizado e põe destaque primeiro', () => {
    const itens = [
      { id: '1', neighborhood: 'Mais Parque', featured: false },
      { id: '2', neighborhood: 'Mais parque ', featured: true },
      { id: '3', neighborhood: 'Outro bairro', featured: true },
    ]
    const resultado = propertiesInNeighborhood(itens, 'mais-parque')
    expect(resultado.map((p) => p.id)).toEqual(['2', '1'])
  })
})
