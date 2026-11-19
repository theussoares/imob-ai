import { describe, expect, it } from 'vitest'
import { agoraBrasilData, atalhoDoPeriodo, periodoDoAtalho, textoPeriodo } from '../../domain/periodo'

// Data local fixa (getters locais) = o «relógio de Brasília» que a função recebe.
const ref = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12)

describe('periodoDoAtalho', () => {
  const hoje = ref(2026, 11, 18)
  it('hoje e janelas móveis contam o dia atual', () => {
    expect(periodoDoAtalho('hoje', hoje)).toEqual({ de: '2026-11-18', ate: '2026-11-18' })
    expect(periodoDoAtalho('7d', hoje)).toEqual({ de: '2026-11-12', ate: '2026-11-18' })
    expect(periodoDoAtalho('30d', hoje)).toEqual({ de: '2026-10-20', ate: '2026-11-18' })
  })
  it('este mês vai do dia 1 até hoje', () => {
    expect(periodoDoAtalho('mes', hoje)).toEqual({ de: '2026-11-01', ate: '2026-11-18' })
  })
  it('mês passado cobre o mês cheio, inclusive virada de ano e bissexto', () => {
    expect(periodoDoAtalho('mes-passado', hoje)).toEqual({ de: '2026-10-01', ate: '2026-10-31' })
    expect(periodoDoAtalho('mes-passado', ref(2027, 1, 5))).toEqual({ de: '2026-12-01', ate: '2026-12-31' })
    expect(periodoDoAtalho('mes-passado', ref(2028, 3, 10))).toEqual({ de: '2028-02-01', ate: '2028-02-29' })
    expect(periodoDoAtalho('mes-passado', ref(2026, 3, 10))).toEqual({ de: '2026-02-01', ate: '2026-02-28' })
  })
})

describe('agoraBrasilData', () => {
  it('à noite em Brasília ainda é o dia anterior ao UTC', () => {
    const d = agoraBrasilData(new Date('2026-11-19T01:00:00Z'))
    expect(periodoDoAtalho('hoje', d).de).toBe('2026-11-18')
  })
})

describe('atalhoDoPeriodo / textoPeriodo', () => {
  const hoje = ref(2026, 11, 18)
  it('reconhece atalho e devolve null para período livre', () => {
    expect(atalhoDoPeriodo({ de: '2026-11-12', ate: '2026-11-18' }, hoje)).toBe('7d')
    expect(atalhoDoPeriodo({ de: '2026-11-01', ate: '2026-11-17' }, hoje)).toBeNull()
    expect(atalhoDoPeriodo({ de: '', ate: '' }, hoje)).toBeNull()
  })
  it('formata o período como texto', () => {
    expect(textoPeriodo({ de: '2026-11-01', ate: '2026-11-18' })).toBe('01/11/2026 – 18/11/2026')
    expect(textoPeriodo({ de: '2026-11-18', ate: '2026-11-18' })).toBe('18/11/2026')
    expect(textoPeriodo({ de: '2026-11-01', ate: '' })).toBe('A partir de 01/11/2026')
    expect(textoPeriodo({ de: '', ate: '2026-11-18' })).toBe('Até 18/11/2026')
    expect(textoPeriodo({ de: '', ate: '' })).toBe('Qualquer data')
  })
})
