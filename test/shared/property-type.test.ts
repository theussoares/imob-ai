import { describe, expect, test } from 'vitest'
import {
  PROPERTY_TYPE_REGISTRY,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  temQuartos,
} from '~~/shared/models/property-type'

/**
 * Estes testes existem para que acrescentar um tipo custe uma linha e falhe
 * ALTO quando algo faltar. Antes, o tipo vivia espalhado em oito arquivos e
 * esquecer o mapa do portal compilava normalmente — o imóvel só sumia do ZAP.
 */
describe('registro de tipos', () => {
  test('todo tipo tem todos os campos preenchidos', () => {
    for (const [chave, t] of Object.entries(PROPERTY_TYPE_REGISTRY)) {
      expect(t.label, `${chave}.label`).toBeTruthy()
      expect(t.plural, `${chave}.plural`).toBeTruthy()
      expect(t.slug, `${chave}.slug`).toBeTruthy()
      expect(t.vrsync, `${chave}.vrsync`).toBeTruthy()
      expect(typeof t.temQuartos, `${chave}.temQuartos`).toBe('boolean')
    }
  })

  // A chave é gravada no banco e entra na URL do imóvel: acento ou espaço ali
  // vira percent-encoding no meio do slug.
  test('as chaves são seguras para banco e URL', () => {
    for (const chave of Object.keys(PROPERTY_TYPE_REGISTRY)) {
      expect(chave, chave).toMatch(/^[a-z]+$/)
    }
  })

  // Slug repetido faria duas categorias apontarem para a mesma URL, e uma delas
  // simplesmente nunca abriria.
  test('os slugs de categoria não colidem', () => {
    const slugs = Object.values(PROPERTY_TYPE_REGISTRY).map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test('os slugs também são seguros para URL', () => {
    for (const t of Object.values(PROPERTY_TYPE_REGISTRY)) {
      expect(t.slug, t.slug).toMatch(/^[a-z]+$/)
    }
  })

  // Valor fora da ontologia do VRSync faz o portal recusar o anúncio.
  test('todo vrsync usa o formato "Categoria / Tipo" documentado', () => {
    for (const t of Object.values(PROPERTY_TYPE_REGISTRY)) {
      expect(t.vrsync, t.vrsync).toMatch(/^(Residential|Commercial) \/ .+$/)
    }
  })

  test('as listas derivadas acompanham o registro', () => {
    const chaves = Object.keys(PROPERTY_TYPE_REGISTRY)
    expect(PROPERTY_TYPES).toEqual(chaves)
    expect(Object.keys(PROPERTY_TYPE_LABELS)).toEqual(chaves)
  })

  test('os tipos que o cliente já usa continuam existindo', () => {
    // Trocar ou remover uma destas chaves deixaria imóveis publicados órfãos.
    for (const chave of ['casa', 'apartamento', 'sobrado', 'terreno']) {
      expect(PROPERTY_TYPES).toContain(chave)
    }
  })
})

describe('temQuartos', () => {
  test('imóvel de morar tem quartos', () => {
    expect(temQuartos('casa')).toBe(true)
    expect(temQuartos('apartamento')).toBe(true)
    expect(temQuartos('chacara')).toBe(true)
  })

  // Substitui os oito `=== 'terreno'` espalhados pelo código. Eles nunca
  // quiseram saber "é terreno", e sim "tem quarto para anunciar".
  test('terreno, barracão e sala não têm', () => {
    expect(temQuartos('terreno')).toBe(false)
    expect(temQuartos('barracao')).toBe(false)
    expect(temQuartos('sala')).toBe(false)
  })
})
