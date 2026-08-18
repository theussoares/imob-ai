import { describe, expect, test } from 'vitest'
import { buildOwnerLeadMessage } from '~~/shared/utils/owner-lead'

describe('buildOwnerLeadMessage', () => {
  test('descreve o imóvel oferecido em uma linha legível', () => {
    // É isto que aparece no card do funil. Se sair truncado ou com separador
    // solto, a corretora liga sem saber do que se trata.
    expect(
      buildOwnerLeadMessage({
        purpose: 'venda',
        propertyType: 'casa',
        neighborhood: 'Centro',
        note: '',
      }),
    ).toBe('Quer vender · Casa · Centro')
  })

  test('acrescenta a observação depois dos dados', () => {
    expect(
      buildOwnerLeadMessage({
        purpose: 'aluguel',
        propertyType: 'apartamento',
        neighborhood: 'Jardim das Paineiras',
        note: 'Está alugado até dezembro.',
      }),
    ).toBe('Quer alugar · Apartamento · Jardim das Paineiras — Está alugado até dezembro.')
  })

  test('omite campo vazio sem deixar separador solto', () => {
    expect(buildOwnerLeadMessage({ purpose: 'venda', propertyType: '', neighborhood: '', note: '' })).toBe(
      'Quer vender',
    )
    expect(buildOwnerLeadMessage({ purpose: 'venda', propertyType: 'terreno', neighborhood: '', note: '' })).toBe(
      'Quer vender · Terreno',
    )
  })

  test('ignora espaço em branco digitado sem querer', () => {
    expect(buildOwnerLeadMessage({ purpose: 'venda', propertyType: '', neighborhood: '   ', note: '  ' })).toBe(
      'Quer vender',
    )
  })

  test('usa o rótulo do tipo, não o valor cru do banco', () => {
    expect(buildOwnerLeadMessage({ purpose: 'venda', propertyType: 'apartamento', neighborhood: '', note: '' })).toBe(
      'Quer vender · Apartamento',
    )
  })
})
