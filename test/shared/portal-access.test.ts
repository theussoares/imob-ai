import { describe, expect, test } from 'vitest'
import {
  canClientSeeDocument,
  defaultAudienceFor,
  visibleDocumentsFor,
} from '~~/shared/utils/portal-access'
import type { ContractPartyRole } from '~~/shared/models/portal'

const PUBLICADO = '2026-09-01T12:00:00.000Z'

describe('canClientSeeDocument', () => {
  test('o inquilino vê o boleto endereçado a ele', () => {
    expect(
      canClientSeeDocument({ audience: ['inquilino'], publishedAt: PUBLICADO }, ['inquilino']),
    ).toBe(true)
  })

  test('o proprietário NÃO vê o boleto do inquilino', () => {
    // O vazamento mais caro desta feature: o dono do imóvel descobrindo os
    // dados de pagamento de quem mora lá.
    expect(
      canClientSeeDocument({ audience: ['inquilino'], publishedAt: PUBLICADO }, ['proprietario']),
    ).toBe(false)
  })

  test('o inquilino NÃO vê o extrato de repasse do proprietário', () => {
    // E o espelho dele: quanto a imobiliária repassa ao dono não é assunto de
    // quem aluga.
    expect(
      canClientSeeDocument({ audience: ['proprietario'], publishedAt: PUBLICADO }, ['inquilino']),
    ).toBe(false)
  })

  test('rascunho não é visível nem para quem é do contrato', () => {
    // A imobiliária sobe 12 boletos ao longo do dia; o cliente não pode ver a
    // lista pela metade e ligar perguntando do que falta.
    expect(
      canClientSeeDocument({ audience: ['inquilino'], publishedAt: null }, ['inquilino']),
    ).toBe(false)
  })

  test('quem não é parte do contrato não vê nada, mesmo publicado', () => {
    expect(canClientSeeDocument({ audience: ['inquilino'], publishedAt: PUBLICADO }, [])).toBe(false)
  })

  test('quem acumula papéis vê pelos dois', () => {
    // Aluga um imóvel e é dono de outro: mesma conta, papéis diferentes por
    // contrato. Basta um papel bater.
    const roles: ContractPartyRole[] = ['inquilino', 'proprietario']
    expect(canClientSeeDocument({ audience: ['proprietario'], publishedAt: PUBLICADO }, roles)).toBe(
      true,
    )
  })

  test('audiência vazia não vaza para ninguém', () => {
    expect(canClientSeeDocument({ audience: [], publishedAt: PUBLICADO }, ['inquilino'])).toBe(false)
  })
})

describe('visibleDocumentsFor', () => {
  test('devolve só o que é do papel de quem pediu', () => {
    const docs = [
      { id: 'contrato', audience: ['inquilino', 'proprietario'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'boleto', audience: ['inquilino'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'extrato', audience: ['proprietario'] as ContractPartyRole[], publishedAt: PUBLICADO },
      { id: 'rascunho', audience: ['proprietario'] as ContractPartyRole[], publishedAt: null },
    ]
    expect(visibleDocumentsFor(docs, ['proprietario']).map((d) => d.id)).toEqual([
      'contrato',
      'extrato',
    ])
  })
})

describe('defaultAudienceFor', () => {
  test('dinheiro que entra é do inquilino, dinheiro que sai é do proprietário', () => {
    expect(defaultAudienceFor('boleto')).toEqual(['inquilino'])
    expect(defaultAudienceFor('recibo')).toEqual(['inquilino'])
    expect(defaultAudienceFor('extrato')).toEqual(['proprietario'])
  })

  test('contrato e vistoria valem para todo mundo que assinou', () => {
    expect(defaultAudienceFor('contrato')).toEqual(['inquilino', 'proprietario', 'fiador'])
    expect(defaultAudienceFor('vistoria')).toEqual(['inquilino', 'proprietario', 'fiador'])
  })

  test('categoria genérica não inclui o fiador por engano', () => {
    expect(defaultAudienceFor('outro')).toEqual(['inquilino', 'proprietario'])
  })
})
