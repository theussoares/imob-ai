import { describe, expect, test } from 'vitest'
import { realEstateAgentJsonLd } from '~~/shared/utils/tenant-jsonld'

const base = {
  name: 'Aurora Imóveis',
  alternateNames: [],
  heroSubtitle: null,
  phone: null,
  email: null,
  city: null,
  state: null,
  logoUrl: null,
  instagram: null,
  creci: null,
  addressStreet: null,
  addressNumber: null,
  addressZip: null,
  latitude: null,
  longitude: null,
}

/**
 * Home e "Quem somos" descrevem a MESMA empresa: mesmo `@id`, mesmos campos.
 * Antes o "Quem somos" mandava só nome e URL, e o resultado local do Google não
 * recebia endereço, telefone nem CRECI por aquela página.
 */
describe('realEstateAgentJsonLd', () => {
  test('cadastro mínimo não gera campo vazio nem null', () => {
    const ld = JSON.parse(JSON.stringify(realEstateAgentJsonLd(base, 'https://aurora.com.br')))
    expect(ld).toEqual({
      '@type': 'RealEstateAgent',
      '@id': 'https://aurora.com.br',
      name: 'Aurora Imóveis',
      url: 'https://aurora.com.br',
    })
  })

  test('CRECI vira identifier, e o endereço estruturado entra no PostalAddress', () => {
    const ld = realEstateAgentJsonLd(
      {
        ...base,
        creci: '12345-J',
        phone: '(67) 3333-4444',
        instagram: 'https://instagram.com/aurora',
        city: 'Três Lagoas',
        state: 'MS',
        addressStreet: 'Rua A',
        addressNumber: '10',
        addressZip: '79600-000',
        latitude: -20.75,
        longitude: -51.68,
      },
      'https://aurora.com.br',
    )
    expect(ld.identifier).toEqual({ '@type': 'PropertyValue', propertyID: 'CRECI', value: '12345-J' })
    expect(ld.telephone).toBe('(67) 3333-4444')
    expect(ld.sameAs).toEqual(['https://instagram.com/aurora'])
    expect(ld.address).toMatchObject({ streetAddress: 'Rua A, 10', addressLocality: 'Três Lagoas', addressRegion: 'MS' })
    expect(ld.geo).toEqual({ '@type': 'GeoCoordinates', latitude: -20.75, longitude: -51.68 })
  })
})
