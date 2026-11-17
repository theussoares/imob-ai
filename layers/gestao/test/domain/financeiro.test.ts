import { describe, expect, it } from 'vitest'
import { competenciasDisponiveis, pendenciasFinanceiras, resumoLocacoes, resumoVendas } from '../../domain/financeiro'
import { locacoesSeed } from '../../domain/locacao-seed'
import { processosSeed } from '../../domain/seed'

const HOJE = '2026-11-17'
const locacoes = () => locacoesSeed(HOJE)

describe('resumoVendas', () => {
  it('soma comissão, adiantado e a receber, e deixa a venda cancelada de fora', () => {
    const processos = processosSeed()
    const r = resumoVendas(processos)
    expect(r.linhas.some((l) => l.status === 'Venda cancelada')).toBe(false)
    expect(r.linhas.length).toBe(processos.filter((p) => p.status !== 'Venda cancelada').length)
    // V-2026-0142: 100.000 a 5% = 5.000, todo adiantado (2.000 + 500 + 2.500).
    const v142 = r.linhas.find((l) => l.id === 'V-2026-0142')!
    expect(v142).toMatchObject({ comissaoTotal: 5000, adiantado: 5000, aReceber: 0 })
    expect(r.comissaoTotal).toBeCloseTo(r.adiantado + r.aReceber, 2)
  })
})

describe('resumoLocacoes', () => {
  it('classifica a cobrança em paga, aberta ou atrasada pela data de hoje', () => {
    const r = resumoLocacoes(locacoes(), HOJE)
    const paga = r.linhas.find((l) => l.situacao === 'paga' && l.locacaoId === 'L-2026-0001')!
    const atrasada = r.linhas.find((l) => l.situacao === 'atrasada')!
    expect(paga).toMatchObject({ valor: 2500, taxa: 250, repasse: 2250, repasseSituacao: 'pendente' })
    expect(atrasada).toMatchObject({ locacaoId: 'L-2026-0001', repasseSituacao: 'sem-pagamento' })
    // A mesma cobrança deixa de estar atrasada se hoje for antes do vencimento.
    const antes = resumoLocacoes(locacoes(), '2026-11-01').linhas.find((l) => l.competencia === atrasada.competencia)!
    expect(antes.situacao).toBe('aberta')
  })

  it('totaliza recebido, em aberto, atraso, taxa e repasses', () => {
    const r = resumoLocacoes(locacoes(), HOJE)
    expect(r.recebido).toBe(2500 + 1800)
    expect(r.emAtraso).toBe(2500)
    expect(r.emAberto).toBe(0)
    expect(r.taxaRecebida).toBe(250 + 144)
    expect(r.repasseFeito).toBe(1656)
    expect(r.repassePendente).toBe(2250)
  })

  it('filtra por competência e lista as competências da mais recente para a mais antiga', () => {
    const l = locacoes()
    const comps = competenciasDisponiveis(l)
    expect(comps).toEqual([...comps].sort().reverse())
    const so = resumoLocacoes(l, HOJE, comps[0])
    expect(so.linhas.every((x) => x.competencia === comps[0])).toBe(true)
    expect(resumoLocacoes(l, HOJE, '1999-01').linhas).toEqual([])
  })

  it('o repasse que ainda não foi registrado sai de aluguel menos taxa', () => {
    const l = locacoes()
    const ativa = l.find((x) => x.id === 'L-2026-0001')!
    const aberta = ativa.cobrancas.find((c) => !c.pago)!
    expect(resumoLocacoes(l, HOJE).linhas.find((x) => x.competencia === aberta.competencia)!.repasse).toBe(2250)
  })
})

describe('pendenciasFinanceiras', () => {
  it('lista o que falta receber (atrasado primeiro) e os repasses pendentes, de todas as competências', () => {
    const p = pendenciasFinanceiras(locacoes(), HOJE)
    expect(p.receber.length).toBeGreaterThan(0)
    expect(p.receber.every((l) => l.situacao !== 'paga')).toBe(true)
    expect(p.receber[0]!.situacao).toBe('atrasada')
    expect(p.repassar.every((l) => l.repasseSituacao === 'pendente')).toBe(true)
    expect(p.repassar.some((l) => l.locacaoId === 'L-2026-0001' && l.repasse === 2250)).toBe(true)
  })

  it('deixa de fora a locação encerrada, que só aceita consulta', () => {
    const todas = locacoes().map((l) => ({ ...l, status: 'Encerrada' as const }))
    const p = pendenciasFinanceiras(todas, HOJE)
    expect(p.receber).toEqual([])
    expect(p.repassar).toEqual([])
  })
})
