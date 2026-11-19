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

describe('Aluguéis em atraso: cobranças vencidas e não quitadas, só do escopo', () => {
  const loc = (id: string, corretorId: string, status: string, cobrancas: unknown[]) => ({ id, corretorId, status, arquivado: false, cobrancas, hist: [] }) as never
  const venc = { id: 'cb-1', competencia: '2026-10', valor: 3000, vencimento: '2026-10-10' }
  const parcial = { ...venc, id: 'cb-2', pagamentos: [{ id: 'pg-1', valor: 500, data: '2026-10-12', forma: 'PIX' }] }
  const quitada = { ...venc, id: 'cb-3', pago: { data: '2026-10-09', comprovante: '' } }
  const futura = { ...venc, id: 'cb-4', vencimento: '2026-12-10' }
  const todas = [
    loc('L-2026-0101', 'c1', 'Contrato e aluguel', [parcial, quitada, futura]), // não «Ativa»: os avisos ignoravam
    loc('L-2026-0102', 'c2', 'Ativa', [venc]),
    loc('L-2026-0103', 'c1', 'Encerrada', [venc]),
  ]
  const conta = (ls: unknown[]) => resumoDashboard([], ls as never, [], HOJE).aluguelEmAtraso

  it('parcial vencida conta; quitada, a vencer e locação encerrada não', () => {
    expect(conta([todas[0]])).toBe(1)
    expect(conta([todas[2]])).toBe(0)
  })
  it('Dono (todas) vê 2; Corretor c1 recebe só as dele e vê 1 — só a quantidade, sem R$', () => {
    expect(conta(todas)).toBe(2)
    expect(conta(todas.filter((l) => (l as { corretorId: string }).corretorId === 'c1'))).toBe(1)
    expect(JSON.stringify(resumoDashboard([], [todas[0]] as never, [], HOJE))).not.toMatch(/3000|2500|valor/)
  })
})
