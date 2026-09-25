import { describe, expect, test } from 'vitest'
import type { Lead } from '~~/shared/models/lead'
import { leadsParaAtender } from '~~/shared/utils/lead-agenda'

/**
 * "Para atender agora" no topo do dashboard.
 *
 * ⚠️ O risco é a fila que mente: um contato fechado cobrando atenção, o mesmo
 * contato aparecendo duas vezes, ou o novo de ontem escondido atrás do de
 * cinco minutos atrás — que é justamente o que está perdendo o prazo.
 */
const NOW = new Date('2026-09-25T12:00:00Z').getTime()
const h = (n: number) => new Date(NOW - n * 3600_000).toISOString()

function lead(p: Partial<Lead> & { id: string }): Lead {
  return {
    tenantId: 't', propertyId: null, name: p.id, phone: null, message: null,
    source: 'outro', leadType: 'indefinido', stage: 'novo', notes: null,
    nextContactAt: null, brokerId: null, createdAt: h(1), updatedAt: h(1),
    updatedBy: null, ...p,
  }
}

describe('leadsParaAtender', () => {
  test('retorno vencido vem antes de contato novo', () => {
    const r = leadsParaAtender([
      lead({ id: 'novo' }),
      lead({ id: 'atrasado', stage: 'visita', nextContactAt: h(2) }),
    ], NOW)
    expect(r.itens.map((i) => i.lead.id)).toEqual(['atrasado', 'novo'])
  })

  test('entre novos, quem espera há mais tempo vem primeiro', () => {
    const r = leadsParaAtender([
      lead({ id: 'agora', createdAt: h(0.1) }),
      lead({ id: 'ontem', createdAt: h(20) }),
    ], NOW)
    expect(r.itens.map((i) => i.lead.id)).toEqual(['ontem', 'agora'])
  })

  test('fechado e perdido não cobram atenção, mesmo com retorno vencido', () => {
    const r = leadsParaAtender([
      lead({ id: 'f', stage: 'fechado', nextContactAt: h(5) }),
      lead({ id: 'p', stage: 'perdido', nextContactAt: h(5) }),
    ], NOW)
    expect(r.total).toBe(0)
  })

  test('novo com retorno vencido aparece uma vez só', () => {
    const r = leadsParaAtender([lead({ id: 'x', nextContactAt: h(1) })], NOW)
    expect(r.itens).toHaveLength(1)
    expect(r.itens[0]!.motivo).toBe('retorno_atrasado')
  })

  test('retorno no futuro não está atrasado', () => {
    const r = leadsParaAtender([lead({ id: 'x', stage: 'contato', nextContactAt: h(-3) })], NOW)
    expect(r.total).toBe(0)
  })

  test('corta no limite mas conta o total', () => {
    const muitos = Array.from({ length: 8 }, (_, i) => lead({ id: `n${i}` }))
    const r = leadsParaAtender(muitos, NOW, 5)
    expect(r.itens).toHaveLength(5)
    expect(r.total).toBe(8)
  })
})
