import { describe, expect, it } from 'vitest'
import type { Estado } from '../../domain/acoes'
import * as a from '../../domain/acoes-locacao'
import { documentosLocacaoSeed, locacoesSeed } from '../../domain/locacao-seed'
import type { Locacao } from '../../domain/types'

const ator = { nome: 'Teste' }
const Q = '16/11/2026 10:00'
const novo = (): Estado => ({ processos: [], documentos: documentosLocacaoSeed(), locacoes: locacoesSeed('2026-11-17') })
const loc = (e: Estado, id: string): Locacao => e.locacoes.find((l) => l.id === id)!
const ok = (r: { ok: boolean; estado?: Estado; erro?: string }): Estado => {
  if (!r.ok) throw new Error(r.erro)
  return r.estado!
}
const erro = (r: { ok: boolean; erro?: string }) => (r.ok ? null : r.erro)
const ATIVA = 'L-2026-0001'
const ENCERRADA = 'L-2026-0002'
const ABERTURA = 'L-2026-0004'
const GARANTIA = 'L-2026-0003'

describe('abrir locação', () => {
  it('numera acima do maior id do ano', () => {
    expect(a.proximoIdLocacao(locacoesSeed('2026-11-17'), 2026)).toBe('L-2026-0005')
    expect(a.proximoIdLocacao([], 2027)).toBe('L-2027-0001')
  })
  it('cria L-AAAA-NNNN na etapa 1, sem nada concluído', () => {
    const e = ok(a.abrirLocacao(novo(), { locador: ' Ana ', locatario: 'Bia', imovelId: 'im-101', imovel: 'Apto', corretorId: 'c1' }, ator, Q))
    const n = e.locacoes[0]!
    expect(n.id).toMatch(/^L-\d{4}-\d{4}$/)
    expect(n.etapa).toBe(1)
    expect(n.concluidas).toEqual(Array(8).fill(false))
    expect(n.status).toBe('Em abertura')
    expect(n.locador.nome).toBe('Ana')
  })
  it('exige locador, locatário e imóvel', () => {
    expect(erro(a.abrirLocacao(novo(), { locador: '', locatario: 'b', imovelId: 'x', imovel: 'i', corretorId: 'c1' }, ator))).toBe('Informe o locador.')
    expect(erro(a.abrirLocacao(novo(), { locador: 'a', locatario: ' ', imovelId: 'x', imovel: 'i', corretorId: 'c1' }, ator))).toBe('Informe o locatário.')
    expect(erro(a.abrirLocacao(novo(), { locador: 'a', locatario: 'b', imovelId: '', imovel: '', corretorId: 'c1' }, ator))).toBe('Informe o imóvel.')
  })
})

describe('contrato e cobranças', () => {
  const contrato = { valor: 2000, diaVencimento: 10, inicio: '2026-12-01', fim: '2027-12-01', reajuste: 'IPCA' as const, taxaPct: 10 }
  it('recusa dia de vencimento fora de 1..28, fim antes do início, valor e taxa inválidos', () => {
    for (const ruim of [{ diaVencimento: 29 }, { diaVencimento: 0 }, { fim: '2026-12-01' }, { fim: '2026-11-01' }, { valor: 0 }, { taxaPct: 101 }, { taxaPct: -1 }]) {
      expect(erro(a.salvarContrato(novo(), ATIVA, { ...contrato, ...ruim }, ator))).toBeTruthy()
    }
  })
  it('recusa valor, taxa e dia vazios ou não numéricos (campo apagado na tela)', () => {
    for (const ruim of [{ taxaPct: '' }, { taxaPct: null }, { valor: '' }, { valor: NaN }, { diaVencimento: '' }]) {
      expect(erro(a.salvarContrato(novo(), ATIVA, { ...contrato, ...ruim } as unknown as typeof contrato, ator))).toBeTruthy()
    }
  })
  it('salva contrato válido', () => {
    expect(loc(ok(a.salvarContrato(novo(), ATIVA, contrato, ator, Q)), ATIVA).contrato).toEqual(contrato)
  })
  it('gera cobrança com vencimento no dia do contrato e recusa competência repetida', () => {
    const e = ok(a.gerarCobranca(novo(), ATIVA, '2026-12', ator, Q))
    const c = loc(e, ATIVA).cobrancas.find((x) => x.competencia === '2026-12')!
    expect(c).toMatchObject({ valor: 2500, vencimento: '2026-12-10' })
    expect(erro(a.gerarCobranca(e, ATIVA, '2026-12', ator))).toMatch(/já existe/i)
    expect(erro(a.gerarCobranca(novo(), ATIVA, '12/2026', ator))).toBeTruthy()
    expect(erro(a.gerarCobranca(novo(), ABERTURA, '2026-12', ator))).toBe('Salve os dados do contrato antes de gerar cobranças.')
  })
  const pag = (valor: number, data = '2026-11-10', extra = {}) => ({ valor, data, forma: 'PIX' as const, ...extra })

  it('pagamento: valor > 0, data não futura, forma válida; comprovante é opcional', () => {
    const e0 = ok(a.gerarCobranca(novo(), ATIVA, '2026-12', ator, Q))
    const id = 'cb-2026-12'
    expect(erro(a.registrarPagamento(e0, ATIVA, id, pag(0), ator, Q))).toBe('Informe um valor maior que zero.')
    expect(erro(a.registrarPagamento(e0, ATIVA, id, pag(2500, '2026-11-17'), ator, Q))).toBe('A data não pode ser futura.')
    expect(erro(a.registrarPagamento(e0, ATIVA, id, { ...pag(2500), forma: 'Cheque' as never }, ator, Q))).toBe('Escolha a forma de pagamento.')
    const e = ok(a.registrarPagamento(e0, ATIVA, id, pag(2500), ator, Q)) // sem comprovante
    const c = loc(e, ATIVA).cobrancas.find((x) => x.id === id)!
    expect(c.pago).toEqual({ data: '2026-11-10', comprovante: '' })
    expect(c.repasse).toEqual({ valor: 2250, feito: false })
    expect(loc(e, ATIVA).hist[0]!.acao).toContain('Registrou o pagamento')
    // O `hist` chega a perfis sem `valores`: nenhum R$ nele.
    expect(loc(e, ATIVA).hist.map((h) => h.acao).join(' ')).not.toContain('R$')
    expect(erro(a.registrarPagamento(e, ATIVA, id, pag(10), ator, Q))).toMatch(/já está paga/i)
  })

  it('pagamento parcial: fica «Parcial» com saldo; repasse só depois de quitar; passar do devido é recusado', () => {
    const e0 = ok(a.gerarCobranca(novo(), ATIVA, '2026-12', ator, Q))
    const id = 'cb-2026-12'
    const e1 = ok(a.registrarPagamento(e0, ATIVA, id, pag(1000), ator, Q))
    const c1 = loc(e1, ATIVA).cobrancas.find((x) => x.id === id)!
    expect(c1.pago).toBeUndefined()
    expect(c1.repasse).toBeUndefined()
    expect(loc(e1, ATIVA).hist[0]!.acao).toContain('pagamento parcial')
    expect(erro(a.registrarRepasse(e1, ATIVA, id, pag(100), ator, Q))).toBe('Quite a cobrança antes do repasse.')
    expect(erro(a.registrarPagamento(e1, ATIVA, id, pag(2000), ator, Q))).toMatch(/passa do total devido/)
    const e2 = ok(a.registrarPagamento(e1, ATIVA, id, pag(1500), ator, Q))
    expect(loc(e2, ATIVA).cobrancas.find((x) => x.id === id)!.pago).toBeTruthy()
  })

  it('cobrança vencida só quita com multa e juros (valor atualizado na data do pagamento)', () => {
    // vencimento 2026-10-10; pago em 2026-11-09 = 30 dias: multa 2% (50) + juros 1% (25) = 2575
    const e0 = ok(a.gerarCobranca(novo(), ATIVA, '2026-09', ator, Q))
    const id = 'cb-2026-09'
    const e1 = ok(a.registrarPagamento(e0, ATIVA, id, pag(2500, '2026-10-12'), ator, Q))
    expect(loc(e1, ATIVA).cobrancas.find((x) => x.id === id)!.pago).toBeUndefined() // 2 dias de atraso: faltam encargos
  })

  it('repasse: só depois de quitar; valor, data e forma; parcial até cobrir; comprovante opcional', () => {
    expect(erro(a.registrarRepasse(novo(), ATIVA, 'cb-2026-11', pag(100), ator, Q))).toBe('Quite a cobrança antes do repasse.')
    const e1 = ok(a.registrarRepasse(novo(), ATIVA, 'cb-2026-10', pag(1000), ator, Q))
    expect(loc(e1, ATIVA).cobrancas.find((c) => c.id === 'cb-2026-10')!.repasse).toMatchObject({ feito: false, repassado: 1000, valor: 2250 })
    expect(erro(a.registrarRepasse(e1, ATIVA, 'cb-2026-10', pag(1500), ator, Q))).toMatch(/passa do que falta repassar/)
    const e2 = ok(a.registrarRepasse(e1, ATIVA, 'cb-2026-10', pag(1250), ator, Q))
    expect(loc(e2, ATIVA).cobrancas.find((c) => c.id === 'cb-2026-10')!.repasse).toMatchObject({ feito: true, repassado: 2250, forma: 'PIX', comprovante: null })
    expect(erro(a.registrarRepasse(e2, ATIVA, 'cb-2026-10', pag(1), ator, Q))).toMatch(/já foi feito/i)
  })
})

describe('etapas', () => {
  it('não conclui com pendência e mostra o motivo', () => {
    expect(erro(a.concluirEtapaLocacao(novo(), ABERTURA, 1, ator))).toBeNull()
    expect(erro(a.concluirEtapaLocacao(novo(), GARANTIA, 5, ator))).toBe('Escolha o tipo de garantia e salve.')
  })
  it('avança em ordem e atualiza o status', () => {
    const e = ok(a.concluirEtapaLocacao(novo(), ABERTURA, 1, ator, Q))
    expect(loc(e, ABERTURA)).toMatchObject({ etapa: 2, status: 'Aguardando documentação' })
    expect(loc(e, ABERTURA).concluidas[0]).toBe(true)
    expect(erro(a.concluirEtapaLocacao(novo(), ABERTURA, 3, ator))).toBe('Conclua as etapas anteriores primeiro.')
  })
  it('garantia salva e permite concluir a etapa 5', () => {
    const base = novo()
    base.documentos.push({
      id: 'g1', nome: 'garantia.pdf', categoria: 'locacao', processoId: GARANTIA, estado: 'enviado', tamanho: 1,
      versoes: 1, enviadoPor: 'x', requisito: 'locacao:garantia', apagado: null,
    })
    let e = ok(a.salvarGarantia(base, GARANTIA, { tipo: 'Caução', detalhe: '3 aluguéis' }, ator, Q))
    e = ok(a.concluirEtapaLocacao(e, GARANTIA, 5, ator, Q))
    expect(loc(e, GARANTIA)).toMatchObject({ etapa: 6, status: 'Aguardando vistoria de entrada' })
  })
  it('vistoria de saída só depois do contrato concluído', () => {
    const v = { data: '2027-01-01', responsavel: 'M', fotos: ['a.jpg'], observacao: '' }
    expect(erro(a.salvarVistoria(novo(), ABERTURA, 'saida', v, ator))).toBe('A vistoria de saída só vale depois do contrato.')
    expect(loc(ok(a.salvarVistoria(novo(), ATIVA, 'saida', v, ator, Q)), ATIVA).vistoriaSaida).toEqual(v)
  })
})

describe('acompanhamento', () => {
  it('renova por 12 meses só locação ativa', () => {
    expect(loc(ok(a.renovarLocacao(novo(), ATIVA, ator, Q)), ATIVA).contrato!.fim).toBe('2028-01-01')
    expect(erro(a.renovarLocacao(novo(), ENCERRADA, ator))).toBeTruthy()
    expect(erro(a.renovarLocacao(novo(), GARANTIA, ator))).toBe('Só locação ativa pode ser renovada.')
  })
  it('encerra com vistoria de saída e sem repasse pendente', () => {
    expect(erro(a.encerrarLocacao(novo(), ATIVA, ator))).toBe('Registre a vistoria de saída antes de encerrar.')
    let e = ok(a.salvarVistoria(novo(), ATIVA, 'saida', { data: '2027-08-10', responsavel: 'M', fotos: ['s.jpg'], observacao: '' }, ator))
    expect(erro(a.encerrarLocacao(e, ATIVA, ator))).toBe('Há repasse pendente ao proprietário.')
    e = ok(a.registrarRepasse(e, ATIVA, 'cb-2026-10', { valor: 2250, data: '2026-11-10', forma: 'PIX' }, ator, Q))
    e = ok(a.encerrarLocacao(e, ATIVA, ator, Q))
    expect(loc(e, ATIVA).status).toBe('Encerrada')
  })
  it('encerrada é só leitura', () => {
    expect(erro(a.salvarGarantia(novo(), ENCERRADA, { tipo: 'Outra', detalhe: '' }, ator))).toBe('Esta locação está encerrada e só aceita consulta.')
  })
  it('arquiva só encerrada e restaura', () => {
    expect(erro(a.arquivarLocacao(novo(), ATIVA, ator))).toBe('Só dá para arquivar locação encerrada.')
    const e = ok(a.arquivarLocacao(novo(), ENCERRADA, ator, Q))
    expect(loc(e, ENCERRADA).arquivado).toBe(true)
    expect(erro(a.arquivarLocacao(e, ENCERRADA, ator))).toBe('Esta locação já está arquivada.')
    expect(loc(ok(a.restaurarLocacao(e, ENCERRADA, ator, Q)), ENCERRADA).arquivado).toBe(false)
  })
  it('nunca muta o estado recebido', () => {
    const e = novo()
    const copia = JSON.stringify(e)
    a.renovarLocacao(e, ATIVA, ator, Q)
    a.gerarCobranca(e, ATIVA, '2026-12', ator, Q)
    expect(JSON.stringify(e)).toBe(copia)
  })
  it('id inexistente', () => {
    expect(erro(a.renovarLocacao(novo(), 'nao-existe', ator))).toBe('Locação não encontrada.')
  })
})

describe('documentos da locação', () => {
  const dados = { nome: 'rg.pdf', categoria: 'pessoas' as const, processoId: GARANTIA, tamanho: 1000, requisito: 'locatario:rg-cnh' }
  it('envia arquivo ligado ao item e registra no histórico', () => {
    const e = ok(a.enviarDocumentoLocacao(novo(), dados, ator, Q))
    expect(e.documentos[0]).toMatchObject({ processoId: GARANTIA, requisito: 'locatario:rg-cnh', estado: 'enviado', categoria: 'pessoas' })
    expect(loc(e, GARANTIA).hist[0]!.acao).toBe('Enviou o documento: RG ou CNH')
  })
  it('recusa extensão, tamanho, item desconhecido, locação inexistente e encerrada', () => {
    expect(erro(a.enviarDocumentoLocacao(novo(), { ...dados, nome: 'x.exe' }, ator))).toBe('Use PDF, JPG, PNG ou WEBP.')
    expect(erro(a.enviarDocumentoLocacao(novo(), { ...dados, tamanho: 16 * 1024 * 1024 }, ator))).toBe('O arquivo passa de 15 MB.')
    expect(erro(a.enviarDocumentoLocacao(novo(), { ...dados, requisito: 'x:y' }, ator))).toBe('Item de checklist desconhecido.')
    expect(erro(a.enviarDocumentoLocacao(novo(), { ...dados, processoId: 'nada' }, ator))).toBe('Locação não encontrada.')
    expect(erro(a.enviarDocumentoLocacao(novo(), { ...dados, processoId: ENCERRADA }, ator))).toBe('Esta locação está encerrada e só aceita consulta.')
  })
})
