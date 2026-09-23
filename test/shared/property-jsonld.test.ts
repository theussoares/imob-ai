import { describe, expect, test } from 'vitest'
import type { Property } from '~~/shared/models/property'
import { propertyJsonLd, publicAddress } from '~~/shared/utils/property-jsonld'

/**
 * Colunas internas de `properties`. Nenhuma pode aparecer no JSON-LD: ele é
 * servido no HTML público e lido por robô.
 *
 * É a mesma lista de `public-payload-guardrail.test.ts`. Coluna interna nova
 * entra nos dois lugares — e é justamente o tipo de esquecimento que fez
 * `updated_by` vazar para o JSON público uma vez.
 */
const COLUNAS_INTERNAS = ['location', 'brokerId', 'ownerName', 'ownerPhone', 'updatedBy']

function imovel(over: Partial<Property> = {}): Property {
  return {
    id: 'id-1',
    tenantId: 't-1',
    code: 'VD-061',
    title: 'Casa no Mais Parque',
    type: 'casa',
    purpose: 'venda',
    price: 320000,
    neighborhood: 'Mais Parque',
    city: 'Três Lagoas',
    state: 'MS',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking: 2,
    area: 126,
    highStandard: false,
    description: 'Casa boa.',
    features: [],
    status: 'active',
    featured: false,
    images: [{ id: 'i1', url: 'https://cdn/a.webp', urlSm: null, alt: null, position: 0, isCover: true }],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    ...over,
  }
}

const CTX = { tenantName: 'OLMI Imóveis', canonical: 'https://x.com.br/casa-3-quartos/VD-061' }

describe('nenhum campo interno chega ao robô', () => {
  // O caminho real: a página de detalhe monta o JSON-LD a partir do modelo
  // COMPLETO, que carrega os campos internos quando a leitura vem do painel.
  test('mesmo recebendo o imóvel com todos os campos internos preenchidos', () => {
    const serializado = JSON.stringify(
      propertyJsonLd(
        imovel({
          location: 'Rua das Flores, 123',
          brokerId: 'corretor-1',
          ownerName: 'Fulano Proprietário',
          ownerPhone: '5567999999999',
          updatedBy: 'usuario-1',
        }),
        CTX,
      ),
    )
    for (const campo of COLUNAS_INTERNAS) {
      expect(serializado, campo).not.toContain(campo)
    }
    expect(serializado).not.toContain('Rua das Flores')
    expect(serializado).not.toContain('Fulano Proprietário')
    expect(serializado).not.toContain('5567999999999')
  })
})

describe('endereço público', () => {
  test('cidade vira addressLocality e UF vira addressRegion', () => {
    expect(publicAddress({ city: 'Três Lagoas', state: 'MS' })).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'BR',
      addressLocality: 'Três Lagoas',
      addressRegion: 'MS',
    })
  })

  // Endereço vazio é pior que endereço ausente: diz ao robô que o imóvel fica
  // num lugar sem nome.
  test('sem cidade e sem UF, não sai endereço nenhum', () => {
    expect(publicAddress({ city: null, state: null })).toBeUndefined()
    expect(publicAddress({ city: '  ', state: '' })).toBeUndefined()
  })
})

describe('quartos e área seguem o vocabulário do tipo', () => {
  test('casa declara numberOfRooms e floorSize', () => {
    const ld = propertyJsonLd(imovel(), CTX) as Record<string, unknown>
    expect(ld.numberOfRooms).toBe(3)
    expect(ld.floorSize).toEqual({ '@type': 'QuantitativeValue', value: 126, unitCode: 'MTK' })
  })

  /**
   * Terreno é `Place` no schema.org, e Place não tem `numberOfRooms` nem
   * `floorSize`. Emitir assim mesmo seria inventar propriedade fora do
   * vocabulário — o mesmo erro que `vrsync` ensina a não cometer com o portal.
   */
  test('terreno não declara nenhum dos dois', () => {
    const ld = propertyJsonLd(imovel({ type: 'terreno', bedrooms: 0 }), CTX) as Record<string, unknown>
    expect(ld).not.toHaveProperty('numberOfRooms')
    expect(ld).not.toHaveProperty('floorSize')
    expect(ld['@type']).toEqual(['Product', 'Place'])
  })

  test('o par de tipos sai do registro', () => {
    expect((propertyJsonLd(imovel({ type: 'apartamento' }), CTX) as Record<string, unknown>)['@type'])
      .toEqual(['Product', 'Apartment'])
  })
})
