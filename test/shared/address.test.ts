import { describe, expect, test } from 'vitest'
import { formatTenantAddress, googleMapsEmbedSrc, googleMapsLink, hasStructuredAddress, tenantCoordinates } from '~~/shared/utils/address'

describe('hasStructuredAddress', () => {
  test('true só quando há rua', () => {
    expect(hasStructuredAddress({ addressStreet: 'Av. Brasil' })).toBe(true)
    expect(hasStructuredAddress({ addressStreet: '   ' })).toBe(false)
    expect(hasStructuredAddress({ addressStreet: null })).toBe(false)
    expect(hasStructuredAddress({})).toBe(false)
  })
})

describe('formatTenantAddress', () => {
  test('junta tudo o que existe, na ordem esperada', () => {
    expect(
      formatTenantAddress({
        addressStreet: 'Av. Brasil',
        addressNumber: '1234',
        addressComplement: 'Sala 2',
        addressNeighborhood: 'Centro',
        city: 'Três Lagoas',
        state: 'MS',
        addressZip: '79600000',
      }),
    ).toBe('Av. Brasil, 1234 - Sala 2 - Centro, Três Lagoas/MS - 79600-000')
  })

  test('só o que estiver preenchido — sem traço sobrando', () => {
    expect(formatTenantAddress({ addressStreet: 'Av. Brasil', city: 'Três Lagoas' })).toBe('Av. Brasil - Três Lagoas')
    expect(formatTenantAddress({})).toBe('')
  })

  test('CEP sem 8 dígitos volta cru, sem máscara forçada', () => {
    expect(formatTenantAddress({ addressStreet: 'Av. Brasil', addressZip: '123' })).toBe('Av. Brasil - 123')
  })
})

describe('tenantCoordinates', () => {
  test('só quando as duas estão presentes e são número', () => {
    expect(tenantCoordinates({ latitude: -20.7, longitude: -51.6 })).toEqual({ lat: -20.7, lng: -51.6 })
    expect(tenantCoordinates({ latitude: -20.7, longitude: null })).toBeNull()
    expect(tenantCoordinates({})).toBeNull()
  })
})

describe('googleMapsEmbedSrc / googleMapsLink', () => {
  test('por coordenada quando disponível', () => {
    const t = { addressStreet: 'Av. Brasil', latitude: -20.7, longitude: -51.6 }
    expect(googleMapsEmbedSrc(t)).toBe('https://maps.google.com/maps?q=-20.7,-51.6&z=16&output=embed')
    expect(googleMapsLink(t)).toBe('https://www.google.com/maps/search/?api=1&query=-20.7,-51.6')
  })

  test('cai para o endereço em texto sem coordenada', () => {
    const t = { addressStreet: 'Av. Brasil', city: 'Três Lagoas' }
    expect(googleMapsEmbedSrc(t)).toBe('https://maps.google.com/maps?q=Av.%20Brasil%20-%20Tr%C3%AAs%20Lagoas&z=15&output=embed')
    expect(googleMapsLink(t)).toContain('query=Av.%20Brasil')
  })

  test('null quando não há nem coordenada nem endereço', () => {
    expect(googleMapsEmbedSrc({})).toBeNull()
    expect(googleMapsLink({})).toBeNull()
  })
})
