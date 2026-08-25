import { describe, expect, test } from 'vitest'
import type { Lead } from '~~/shared/models/lead'
import { leadFromRealtimeRow } from '~~/shared/utils/lead-row'

const local: Lead = {
  id: 'l1',
  tenantId: 't1',
  propertyId: 'p1',
  name: 'Ana',
  phone: '67991234567',
  message: 'Tenho interesse',
  source: 'property_page',
  leadType: 'busca_compra',
  stage: 'novo',
  notes: null,
  nextContactAt: null,
  brokerId: null,
  createdAt: '2026-08-18T10:00:00Z',
  updatedAt: '2026-08-18T10:00:00Z',
  property: { code: 'NC-0231', title: 'Casa no Centro' },
}

/** Linha crua como o Realtime entrega: snake_case e SEM o imóvel embutido. */
const row = {
  id: 'l1',
  tenant_id: 't1',
  property_id: 'p1',
  name: 'Ana',
  phone: '67991234567',
  message: 'Tenho interesse',
  source: 'property_page',
  lead_type: 'busca_compra',
  stage: 'visita',
  notes: 'Visita marcada',
  next_contact_at: '2026-08-20T12:00:00Z',
  broker_id: 'b1',
  created_at: '2026-08-18T10:00:00Z',
  updated_at: '2026-08-18T11:00:00Z',
}

describe('leadFromRealtimeRow', () => {
  test('aplica o que a outra pessoa mudou', () => {
    const r = leadFromRealtimeRow(row, local)
    expect(r?.stage).toBe('visita')
    expect(r?.notes).toBe('Visita marcada')
    expect(r?.brokerId).toBe('b1')
  })

  test('preserva o imóvel, que o payload do Realtime não traz', () => {
    // Sem isto o card perderia o link do imóvel toda vez que alguém movesse o
    // contato — o corretor deixaria de ver sobre o que era o contato.
    expect(leadFromRealtimeRow(row, local)?.property).toEqual({
      code: 'NC-0231',
      title: 'Casa no Centro',
    })
  })

  test('normaliza origem e tipo, como o mapper do servidor faz', () => {
    const r = leadFromRealtimeRow({ ...row, source: 'inventado', lead_type: 'xpto' }, local)
    expect(r?.source).toBe('outro')
    expect(r?.leadType).toBe('indefinido')
  })

  test('funciona para contato que ainda não estava na tela', () => {
    // Alguém de outra aba criou o contato e já moveu antes do refetch chegar.
    const r = leadFromRealtimeRow(row, undefined)
    expect(r?.id).toBe('l1')
    expect(r?.property).toBeNull()
  })

  test('ignora payload de outro tenant', () => {
    // Cinto de segurança: a assinatura já filtra por tenant no servidor, mas
    // aplicar cegamente um payload significaria confiar só naquele filtro.
    expect(leadFromRealtimeRow({ ...row, tenant_id: 'outro' }, local, 't1')).toBeNull()
  })

  test('ignora payload sem id', () => {
    expect(leadFromRealtimeRow({ ...row, id: undefined }, local)).toBeNull()
  })
})
