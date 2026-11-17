import { describe, expect, it } from 'vitest'
import { dataDoAtualizado, DIAS_PARADO, resumoDashboard } from '../../domain/dashboard'
import { documentosLocacaoSeed, locacoesSeed } from '../../domain/locacao-seed'
import { documentosSeedCompleto, processosSeed } from '../../domain/seed'

const HOJE = '2026-11-17'
const resumo = (hoje = HOJE, limite = 6) => resumoDashboard(processosSeed(), locacoesSeed(hoje), documentosSeedCompleto(), hoje, limite)

describe('dataDoAtualizado', () => {
  it('converte o texto de exibição em ISO e devolve vazio quando não entende', () => {
    expect(dataDoAtualizado('13/11/2026 09:10')).toBe('2026-11-13')
    expect(dataDoAtualizado('ontem')).toBe('')
  })
})

describe('resumoDashboard', () => {
  it('conta vendas e locações por situação', () => {
    const r = resumo()
    const p = processosSeed()
    expect(r.vendas.andamento + r.vendas.concluidas + r.vendas.canceladas).toBe(p.filter((x) => !x.arquivado).length)
    expect(r.vendas.concluidas).toBe(1)
    expect(r.vendas.canceladas).toBe(1)
    expect(r.locacoes).toEqual({ ativas: 1, implantacao: 2, encerradas: 1 })
  })

  it('lista o aluguel em atraso e o fim de contrato em «Precisa de atenção», o mais grave primeiro', () => {
    const r = resumo()
    expect(r.aluguelEmAtraso).toBe(1)
    expect(r.atencao[0]).toMatchObject({ tipo: 'locacao', nivel: 'vencido', href: '/gestao/locacao/L-2026-0001' })
    expect(r.atencao.some((a) => /termina em 45 dias/.test(a.texto))).toBe(true)
  })

  it('aponta contrato sem movimento há mais de 7 dias, e só os que não estão encerrados', () => {
    // L-2026-0003 foi atualizada em 13/11: em 20/11 são 7 dias (não passa do limite), em 25/11 são 12.
    const antes = resumo('2026-11-20', 99).atencao.find((a) => a.id === 'L-2026-0003')
    expect(antes).toBeUndefined()
    const depois = resumo('2026-11-25', 99).atencao.find((a) => a.id === 'L-2026-0003')
    expect(DIAS_PARADO).toBe(7)
    expect(depois?.texto).toMatch(/Sem movimento há 12 dias/)
    expect(resumo('2027-06-01', 99).atencao.some((a) => a.id === 'L-2026-0002')).toBe(false)
  })

  it('só enxerga o que a tela passou: corretor com uma locação vê o painel dela', () => {
    const doCarlos = locacoesSeed(HOJE).filter((l) => l.corretorId === 'c1')
    const r = resumoDashboard([], doCarlos, [], HOJE)
    expect(r.locacoes).toEqual({ ativas: 1, implantacao: 1, encerradas: 0 })
    expect(r.vendas).toEqual({ andamento: 0, concluidas: 0, canceladas: 0 })
  })

  it('arquivado não conta e documento só conta se é de contrato visível', () => {
    const l = locacoesSeed(HOJE).map((x) => ({ ...x, arquivado: x.id !== 'L-2026-0001' }))
    const docs = [...documentosLocacaoSeed()].map((d) => ({ ...d, estado: 'enviado' as const }))
    const r = resumoDashboard([], l, docs, HOJE)
    expect(r.locacoes.encerradas).toBe(0)
    expect(r.documentosParaConferir).toBe(docs.filter((d) => d.processoId === 'L-2026-0001').length)
  })

  it('limita a lista de atenção', () => {
    expect(resumoDashboard(processosSeed(), locacoesSeed(HOJE), [], '2027-06-01', 2).atencao).toHaveLength(2)
  })

  it('nunca expõe valor em R$', () => {
    expect(JSON.stringify(resumo())).not.toMatch(/R\$/)
  })
})
