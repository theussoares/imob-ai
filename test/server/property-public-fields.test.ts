import { describe, expect, test } from 'vitest'
import { toPropertyModel, toPropertyAdminModel } from '~~/server/mappers/property.mapper'

/**
 * `updatedBy` é o id do funcionário que salvou por último — dado do painel, que
 * não pode sair no JSON público. Antes o mapper público farejava a coluna
 * (`'updated_by' in row`) e a copiava quando ela aparecia, então a garantia
 * dependia de a query ter listado as colunas certas: bastava um `select('*')`
 * em qualquer leitura pública para o id vazar. Aqui a row de propósito TRAZ a
 * coluna — o modelo público tem que ignorá-la de qualquer forma.
 */
function rowWithInternals(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    tenant_id: 't1',
    code: 'NC-0231',
    title: 'Casa no Centro',
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
    high_standard: false,
    description: 'Imóvel bem localizado',
    features: ['quintal'],
    status: 'active',
    featured: false,
    created_at: '2026-08-21T10:00:00.000Z',
    updated_at: '2026-08-21T10:00:00.000Z',
    location: 'Rua Secreta, 123',
    broker_id: 'b1',
    owner_name: 'Dono Silva',
    owner_phone: '5567999990000',
    updated_by: 'uuid-do-funcionario',
    ...over,
  }
}

describe('toPropertyModel (payload público)', () => {
  test('não expõe updatedBy nem quando a row traz a coluna', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = toPropertyModel(rowWithInternals() as any)

    expect('updatedBy' in model).toBe(false)
  })

  test('não expõe os demais campos internos', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = toPropertyModel(rowWithInternals() as any)

    expect(model.location).toBeUndefined()
    expect(model.brokerId).toBeUndefined()
    expect(model.ownerName).toBeUndefined()
    expect(model.ownerPhone).toBeUndefined()
  })
})

describe('toPropertyAdminModel (painel)', () => {
  test('continua expondo updatedBy — a tela de edição mostra quem salvou', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = toPropertyAdminModel(rowWithInternals() as any)

    expect(model.updatedBy).toBe('uuid-do-funcionario')
  })

  test('imóvel antigo sem autor registrado vira null, não undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = toPropertyAdminModel(rowWithInternals({ updated_by: null }) as any)

    expect(model.updatedBy).toBeNull()
  })
})
