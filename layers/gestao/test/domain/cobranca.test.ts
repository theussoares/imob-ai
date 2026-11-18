import { describe, expect, it } from 'vitest'
import { calcularEncargos, devidoDaCobranca, ENCARGOS_PADRAO, situacaoCobranca, validarPagamento } from '../../domain/cobranca'
import type { Cobranca } from '../../domain/types'

const cb = (extra: Partial<Cobranca> = {}): Cobranca => ({ id: 'cb-2026-10', competencia: '2026-10', valor: 2500, vencimento: '2026-10-10', ...extra })

describe('encargos', () => {
  it('no vencimento e antes: sem multa nem juros (atraso conta a partir do dia seguinte)', () => {
    expect(calcularEncargos(2500, '2026-10-10', '2026-10-10')).toMatchObject({ dias: 0, multa: 0, juros: 0, atualizado: 2500 })
    expect(calcularEncargos(2500, '2026-10-10', '2026-10-01').atualizado).toBe(2500)
  })
  it('1 dia de atraso: multa de 2% + juros de 1%/mês pro rata por dia', () => {
    expect(calcularEncargos(3000, '2026-10-10', '2026-10-11')).toEqual({ dias: 1, multa: 60, juros: 1, atualizado: 3061 })
  })
  it('30 dias = 1 mês cheio de juros; usa a configuração informada', () => {
    expect(calcularEncargos(1000, '2026-10-10', '2026-11-09', { multaPct: 10, jurosMesPct: 3 })).toMatchObject({ dias: 30, multa: 100, juros: 30, atualizado: 1130 })
    expect(ENCARGOS_PADRAO).toEqual({ multaPct: 2, jurosMesPct: 1 })
  })
})

describe('situação da cobrança: uma regra só para Financeiro e locação', () => {
  it('em aberto até o vencimento (inclusive), em atraso depois, parcial e paga', () => {
    expect(situacaoCobranca(cb(), '2026-10-10')).toBe('aberta')
    expect(situacaoCobranca(cb(), '2026-10-11')).toBe('atrasada')
    expect(situacaoCobranca(cb({ pagamentos: [{ id: 'pg-1', valor: 100, data: '2026-10-11', forma: 'PIX' }] }), '2026-10-20')).toBe('parcial')
    expect(situacaoCobranca(cb({ pago: { data: '2026-10-11', comprovante: '' } }), '2026-12-01')).toBe('paga')
  })
  it('saldo = atualizado - pago; quitada congela os encargos na data do pagamento', () => {
    const d = devidoDaCobranca(cb({ pagamentos: [{ id: 'pg-1', valor: 1000, data: '2026-10-11', forma: 'PIX' }] }), '2026-10-11')
    expect(d).toMatchObject({ pago: 1000, vencida: true, saldo: 1550.83 }) // 2500 + 50 + 0,83 - 1000
    const q = devidoDaCobranca(cb({ pago: { data: '2026-10-10', comprovante: '' }, pagamentos: [{ id: 'pg-1', valor: 2500, data: '2026-10-10', forma: 'PIX' }] }), '2026-12-01')
    expect(q).toMatchObject({ saldo: 0, encargos: { dias: 0 } })
  })
})

describe('validarPagamento', () => {
  const ok = { valor: 10, data: '2026-11-10', forma: 'PIX' as const }
  it('valor > 0, data válida e não futura, forma da lista', () => {
    expect(validarPagamento(ok, '2026-11-10')).toBeNull()
    expect(validarPagamento({ ...ok, valor: -1 }, '2026-11-10')).toMatch(/maior que zero/)
    expect(validarPagamento({ ...ok, data: '2026-11-11' }, '2026-11-10')).toMatch(/futura/)
    expect(validarPagamento({ ...ok, data: 'x' }, '2026-11-10')).toMatch(/data/i)
  })
})
