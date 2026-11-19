import { describe, expect, it } from 'vitest'
import { calcularComissao, conferirFontes, validarAdiantamento } from '../../domain/commission'
import { processosSeed } from '../../domain/seed'

describe('comissão', () => {
  it('5% de 100.000 = 5.000, dividido 40/10/50', () => {
    const c = calcularComissao({ valor: 100000, pct: 5, adiantamentos: [] })
    expect(c.total).toBe(5000)
    expect(c.partes.map((p) => p.total)).toEqual([2000, 500, 2500])
    expect(c.restante).toBe(5000)
  })

  it('a soma das partes fecha no total mesmo com valor "quebrado" (sem sumir centavo)', () => {
    const c = calcularComissao({ valor: 100000.01, pct: 5, adiantamentos: [] })
    const soma = c.partes.reduce((t, p) => t + p.total, 0)
    expect(Math.round(soma * 100)).toBe(Math.round(c.total * 100))
  })

  it('abate adiantamentos por parte e no total', () => {
    const v0142 = processosSeed().find((p) => p.id === 'V-2026-0142')!
    const c = calcularComissao(v0142)
    expect(c.adiantado).toBe(5000)
    expect(c.restante).toBe(0)
    expect(c.partes.every((p) => p.restante === 0)).toBe(true)
  })

  it('valida adiantamento: zero, negativo e acima do que resta são recusados', () => {
    const p = { valor: 100000, pct: 5, adiantamentos: [] }
    expect(validarAdiantamento(p, { resp: 'vendedor', valor: 0 }).ok).toBe(false)
    expect(validarAdiantamento(p, { resp: 'vendedor', valor: -5 }).ok).toBe(false)
    expect(validarAdiantamento(p, { resp: 'captador', valor: 501 }).ok).toBe(false)
    expect(validarAdiantamento(p, { resp: 'captador', valor: 500 }).ok).toBe(true)
  })

  it('o restante considera o que já foi adiantado àquela parte', () => {
    const p = {
      valor: 100000,
      pct: 5,
      adiantamentos: [{ id: 'x', resp: 'vendedor' as const, valor: 1500, data: '2026-11-01', quem: 'Paulo' }],
    }
    expect(validarAdiantamento(p, { resp: 'vendedor', valor: 501 }).ok).toBe(false)
    expect(validarAdiantamento(p, { resp: 'vendedor', valor: 500 }).ok).toBe(true)
  })

  it('conferência das fontes: fecha ou mostra quanto falta', () => {
    expect(conferirFontes({ valor: 100000, fin: { forma: 'Misto', financiado: 70000, entrada: 20000, fgts: 10000, proprios: 0 } })).toEqual({
      fecha: true,
      diferenca: 0,
    })
    const falta = conferirFontes({ valor: 100000, fin: { forma: 'Misto', financiado: 70000, entrada: 20000, fgts: 0, proprios: 0 } })
    expect(falta.fecha).toBe(false)
    expect(falta.diferenca).toBe(10000)
  })
})

describe('adiantamento «Não pago» não abate o restante', () => {
  const base = { valor: 100000, pct: 5 } // comissão 5.000; vendedor 40% = 2.000
  const adi = (valor: number, pago?: boolean) => ({ id: 'a', resp: 'vendedor' as const, valor, data: '2026-11-01', quem: 'x', ...(pago === undefined ? {} : { pago }) })

  it('só o pago reduz o restante; ausente (processo antigo) conta como pago', () => {
    const v = (a: ReturnType<typeof adi>[]) => calcularComissao({ ...base, adiantamentos: a }).partes[0]!
    expect(v([adi(500, false)])).toMatchObject({ adiantado: 0, restante: 2000 })
    expect(v([adi(500, true)])).toMatchObject({ adiantado: 500, restante: 1500 })
    expect(v([adi(500)])).toMatchObject({ adiantado: 500, restante: 1500 })
  })

  it('não deixa prometer mais que o total da parte, somando os não pagos', () => {
    const p = { ...base, adiantamentos: [adi(1500, false)] }
    expect(validarAdiantamento(p, { resp: 'vendedor', valor: 600 }).ok).toBe(false)
    expect(validarAdiantamento(p, { resp: 'vendedor', valor: 500 }).ok).toBe(true)
  })
})
