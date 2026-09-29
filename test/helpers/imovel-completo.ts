import type { Property } from '~~/shared/models/property'

/** Imóvel publicado que o Canal Pro aceitaria: todo campo exigido preenchido. */
export function imovelCompleto(over: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    tenantId: 't1',
    code: 'NC-0231',
    title: 'Casa com quintal no Centro',
    type: 'casa',
    purpose: 'venda',
    price: 350000,
    neighborhood: 'Centro',
    city: 'Três Lagoas',
    state: 'MS',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking: 2,
    area: 180,
    highStandard: false,
    description: 'Casa ampla, com três quartos, quintal grande e garagem coberta para dois carros.',
    features: ['quintal'],
    status: 'active',
    featured: false,
    images: [{ id: 'i1', url: 'https://cdn.exemplo/1.jpg', urlSm: null, alt: null, position: 0, isCover: true }],
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    addressZip: '79600000',
    addressStreet: 'Rua Paranaíba',
    addressNumber: '123',
    ...over,
  }
}
