import { describe, expect, test } from 'vitest'
import { seekingTypeFor, toLeadSource, toLeadType } from '~~/shared/models/lead'

/**
 * Estas funções guardam um endpoint PÚBLICO: `/api/leads` grava o que chega do
 * body de qualquer visitante. São elas que impedem valor inventado de entrar na
 * tabela e envenenar a métrica de origem que o painel mostra ao cliente.
 */
describe('toLeadSource', () => {
  test('aceita os valores da lista', () => {
    expect(toLeadSource('quero_vender')).toBe('quero_vender')
    expect(toLeadSource('property_page')).toBe('property_page')
  })

  test('joga valor inventado em "outro" em vez de gravar cru', () => {
    expect(toLeadSource('google_ads_campanha_x')).toBe('outro')
    expect(toLeadSource('<script>alert(1)</script>')).toBe('outro')
  })

  test('não confia em tipo não-string vindo do body', () => {
    expect(toLeadSource(undefined)).toBe('outro')
    expect(toLeadSource(null)).toBe('outro')
    expect(toLeadSource(42)).toBe('outro')
    expect(toLeadSource({ toString: () => 'property_page' })).toBe('outro')
  })

  test('"form" não é mais aceito — foi renomeado para property_page', () => {
    // Se voltar a passar, é sinal de que alguém reabriu a lista e a métrica de
    // aquisição vai ter dois nomes para a mesma origem.
    expect(toLeadSource('form')).toBe('outro')
  })
})

describe('toLeadType', () => {
  test('aceita os cinco tipos', () => {
    for (const t of ['busca_compra', 'busca_aluguel', 'oferta_venda', 'oferta_aluguel', 'indefinido']) {
      expect(toLeadType(t)).toBe(t)
    }
  })

  test('cai em "indefinido" em vez de recusar o contato', () => {
    // Classificar não é controle de acesso: valor estranho não pode fazer o
    // visitante perder o formulário.
    expect(toLeadType('compra')).toBe('indefinido')
    expect(toLeadType('')).toBe('indefinido')
    expect(toLeadType(undefined)).toBe('indefinido')
  })
})

describe('seekingTypeFor', () => {
  test('quem escreve na página de um imóvel à venda quer comprar', () => {
    expect(seekingTypeFor('venda')).toBe('busca_compra')
  })

  test('quem escreve na página de um imóvel para alugar quer alugar', () => {
    // O caso que um enum sem `busca_aluguel` jogaria em "compra", errado.
    expect(seekingTypeFor('aluguel')).toBe('busca_aluguel')
  })

  test('sem imóvel de referência, admite que não sabe', () => {
    expect(seekingTypeFor(null)).toBe('indefinido')
    expect(seekingTypeFor(undefined)).toBe('indefinido')
  })
})
