import { describe, expect, it } from 'vitest'
import { avisoPrincipal, avisosLocacao, contarAvisos, diasEntre, hojeISO, somarDias } from '../../domain/avisos-locacao'
import { locacoesSeed } from '../../domain/locacao-seed'
import type { Cobranca, Locacao } from '../../domain/types'

const HOJE = '2026-11-17'

function ativa(fim: string, cobrancas: Cobranca[] = []): Locacao {
  const base = locacoesSeed(HOJE).find((l) => l.id === 'L-2026-0001')!
  return { ...base, contrato: { ...base.contrato!, fim }, cobrancas }
}
const aberta = (competencia: string, vencimento: string): Cobranca => ({ id: `cb-${competencia}`, competencia, valor: 2500, vencimento })

describe('datas', () => {
  it('conta dias corridos, inclusive na virada de mês e de ano', () => {
    expect(diasEntre('2026-11-17', '2026-11-17')).toBe(0)
    expect(diasEntre('2026-11-17', '2026-12-17')).toBe(30)
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3)
    expect(diasEntre('2026-11-17', '2026-11-10')).toBe(-7)
  })

  it('soma dias em ISO', () => {
    expect(somarDias('2026-11-17', 45)).toBe('2027-01-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('hojeISO usa o dia local, não o UTC', () => {
    // 23h30 em São Paulo já é o dia seguinte em UTC; `toISOString` erraria o dia.
    expect(hojeISO(new Date(2026, 10, 17, 23, 30))).toBe('2026-11-17')
  })
})

describe('fim de contrato: marcos de 90, 60 e 30 dias', () => {
  const nivel = (dias: number) => avisosLocacao(ativa(somarDias(HOJE, dias)), HOJE).find((a) => a.tipo === 'fim-contrato')?.nivel

  it.each([
    [91, undefined],
    [90, 'info'],
    [61, 'info'],
    [60, 'atencao'],
    [31, 'atencao'],
    [30, 'urgente'],
    [1, 'urgente'],
    [0, 'urgente'],
    [-1, 'vencido'],
  ])('faltando %i dias → %s', (dias, esperado) => {
    expect(nivel(dias)).toBe(esperado)
  })

  it('dá o texto certo no singular, no plural, hoje e vencido', () => {
    const t = (d: number) => avisosLocacao(ativa(somarDias(HOJE, d)), HOJE)[0]?.texto
    expect(t(1)).toBe('O contrato termina em 1 dia.')
    expect(t(45)).toBe('O contrato termina em 45 dias.')
    expect(t(0)).toBe('O contrato termina hoje.')
    expect(t(-3)).toBe('O contrato venceu há 3 dias. Renove ou encerre a locação.')
  })
})

describe('aluguel em aberto', () => {
  const fimLonge = somarDias(HOJE, 300)

  it('avisa a 5 dias do vencimento e não antes', () => {
    expect(avisosLocacao(ativa(fimLonge, [aberta('2026-11', somarDias(HOJE, 6))]), HOJE)).toEqual([])
    const [a] = avisosLocacao(ativa(fimLonge, [aberta('2026-11', somarDias(HOJE, 5))]), HOJE)
    expect(a).toMatchObject({ tipo: 'aluguel', nivel: 'atencao', texto: 'Aluguel de 11/2026 vence em 5 dias.' })
  })

  it('vencimento hoje e atraso', () => {
    expect(avisosLocacao(ativa(fimLonge, [aberta('2026-11', HOJE)]), HOJE)[0]!.texto).toBe('Aluguel de 11/2026 vence hoje.')
    const [a] = avisosLocacao(ativa(fimLonge, [aberta('2026-11', '2026-11-10')]), HOJE)
    expect(a).toMatchObject({ nivel: 'vencido', texto: 'Aluguel de 11/2026 em atraso há 7 dias.' })
  })

  it('cobrança paga não avisa', () => {
    const paga: Cobranca = { ...aberta('2026-11', '2026-11-10'), pago: { data: '2026-11-09', comprovante: 'x.pdf' } }
    expect(avisosLocacao(ativa(fimLonge, [paga]), HOJE)).toEqual([])
  })
})

describe('quem avisa', () => {
  it('só locação ativa, com contrato e fora do arquivo', () => {
    const base = ativa('2026-11-20', [aberta('2026-11', '2026-11-10')])
    expect(avisosLocacao(base, HOJE)).toHaveLength(2)
    expect(avisosLocacao({ ...base, status: 'Encerrada' }, HOJE)).toEqual([])
    expect(avisosLocacao({ ...base, status: 'Contrato e aluguel' }, HOJE)).toEqual([])
    expect(avisosLocacao({ ...base, arquivado: true }, HOJE)).toEqual([])
    expect(avisosLocacao({ ...base, contrato: undefined }, HOJE)).toEqual([])
  })

  it('ordena do mais grave ao mais leve e o principal é o primeiro', () => {
    const l = ativa('2026-12-20', [aberta('2026-11', '2026-11-10')])
    const out = avisosLocacao(l, HOJE)
    expect(out.map((a) => a.nivel)).toEqual(['vencido', 'atencao'])
    expect(avisoPrincipal(l, HOJE)).toEqual(out[0])
    expect(avisoPrincipal({ ...l, status: 'Encerrada' }, HOJE)).toBeNull()
  })

  it('o texto nunca cita valor em R$ (a recepção não vê valores)', () => {
    const l = ativa('2026-11-20', [aberta('2026-11', '2026-11-10')])
    for (const a of avisosLocacao(l, HOJE)) expect(a.texto).not.toMatch(/R\$|\d+[.,]\d{2}/)
  })

  it('conta os avisos de várias locações', () => {
    const l = ativa('2026-11-20', [aberta('2026-11', '2026-11-10')])
    expect(contarAvisos([l, { ...l, status: 'Encerrada' }], HOJE)).toBe(2)
  })
})

describe('seed de demonstração', () => {
  it('sempre tem uma locação com aviso de fim de contrato e outra com aluguel em atraso, qualquer que seja o dia', () => {
    for (const hoje of ['2026-11-17', '2027-03-01', '2030-07-15']) {
      const todos = locacoesSeed(hoje).flatMap((l) => avisosLocacao(l, hoje))
      expect(todos.some((a) => a.tipo === 'fim-contrato')).toBe(true)
      expect(todos.some((a) => a.tipo === 'aluguel')).toBe(true)
    }
  })
})
