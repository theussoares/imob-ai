import { describe, expect, it } from 'vitest'
import type { Estado } from '../../domain/acoes'
import {
  itensChecklist,
  MSG_PAGO_SEM_COMPROVANTE,
  registrarAdiantamento,
  removerAdiantamento,
  salvarConferenciaFinal,
  salvarFinanceiro,
  salvarImovel,
  salvarPessoa,
} from '../../domain/acoes-processo'
import { calcularComissao } from '../../domain/commission'
import { documentosSeed, processosSeed } from '../../domain/seed'

const ator = { nome: 'Paulo Ribeiro' }
const quando = '15/11/2026 10:00'
const novo = (): Estado => ({ processos: processosSeed(), documentos: documentosSeed(), locacoes: [] })
const proc = (e: Estado, id: string) => e.processos.find((p) => p.id === id)!

// V-0151: R$ 480.000 a 5% → comissão 24.000; vendedor 9.600, já adiantou 6.000 (resta 3.600).
const ABERTO = 'V-2026-0151'
const CONCLUIDO = 'V-2026-0133'
const CANCELADO = 'V-2026-0147'

function ok(r: ReturnType<typeof registrarAdiantamento>) {
  if (!r.ok) throw new Error(r.erro)
  return r.estado
}

describe('registrarAdiantamento', () => {
  it('registra dentro do que resta, com autor e histórico', () => {
    const e = ok(registrarAdiantamento(novo(), ABERTO, { resp: 'vendedor', valor: 3600, data: '2026-11-15' }, ator, quando))
    const p = proc(e, ABERTO)
    expect(p.adiantamentos).toHaveLength(2)
    expect(p.adiantamentos.at(-1)).toMatchObject({ resp: 'vendedor', valor: 3600, quem: 'Paulo Ribeiro' })
    expect(calcularComissao(p).partes[0]!.restante).toBe(0)
    expect(p.hist[0]).toMatchObject({ quem: 'Paulo Ribeiro', quando })
    expect(p.hist[0]!.acao).toContain('adiantamento')
    expect(p.updated).toBe(quando)
  })

  it('gera id novo mesmo depois de remover o anterior', () => {
    let e = ok(registrarAdiantamento(novo(), ABERTO, { resp: 'imob', valor: 100, data: '2026-11-15' }, ator, quando))
    const idNovo = proc(e, ABERTO).adiantamentos.at(-1)!.id
    e = ok(removerAdiantamento(e, ABERTO, idNovo, ator, quando))
    e = ok(registrarAdiantamento(e, ABERTO, { resp: 'imob', valor: 100, data: '2026-11-15' }, ator, quando))
    const ids = proc(e, ABERTO).adiantamentos.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('recusa valor acima do restante da parte', () => {
    const r = registrarAdiantamento(novo(), ABERTO, { resp: 'vendedor', valor: 3600.01, data: '2026-11-15' }, ator, quando)
    expect(r).toMatchObject({ ok: false })
  })

  it.each([0, -10, Number.NaN])('recusa valor inválido (%s)', (valor) => {
    expect(registrarAdiantamento(novo(), ABERTO, { resp: 'imob', valor, data: '2026-11-15' }, ator, quando).ok).toBe(false)
  })

  it('recusa data vazia ou impossível', () => {
    expect(registrarAdiantamento(novo(), ABERTO, { resp: 'imob', valor: 10, data: '' }, ator, quando).ok).toBe(false)
    expect(registrarAdiantamento(novo(), ABERTO, { resp: 'imob', valor: 10, data: '2026-13-45' }, ator, quando).ok).toBe(false)
  })

  it('não muta o estado de entrada', () => {
    const antes = novo()
    const copia = JSON.parse(JSON.stringify(antes))
    registrarAdiantamento(antes, ABERTO, { resp: 'imob', valor: 10, data: '2026-11-15' }, ator, quando)
    expect(antes).toEqual(copia)
  })

  it('recusa processo inexistente e processo final (concluído ou cancelado)', () => {
    const dados = { resp: 'imob' as const, valor: 10, data: '2026-11-15' }
    expect(registrarAdiantamento(novo(), 'V-0000', dados, ator, quando).ok).toBe(false)
    for (const id of [CONCLUIDO, CANCELADO]) {
      const r = registrarAdiantamento(novo(), id, dados, ator, quando)
      expect(r).toMatchObject({ ok: false, erro: expect.stringContaining('encerrado') })
    }
  })
})

describe('removerAdiantamento', () => {
  it('remove só o escolhido e registra no histórico', () => {
    const e = ok(removerAdiantamento(novo(), ABERTO, 'a4', ator, quando))
    const p = proc(e, ABERTO)
    expect(p.adiantamentos).toEqual([])
    expect(p.hist[0]!.acao).toContain('Removeu adiantamento')
  })

  it('recusa id inexistente', () => {
    expect(removerAdiantamento(novo(), ABERTO, 'zzz', ator, quando).ok).toBe(false)
  })

  it('recusa em processo final e não muta a entrada', () => {
    const antes = novo()
    const copia = JSON.parse(JSON.stringify(antes))
    expect(removerAdiantamento(antes, 'V-2026-0142', 'a1', ator, quando).ok).toBe(true)
    expect(removerAdiantamento(antes, CONCLUIDO, 'x', ator, quando).ok).toBe(false)
    expect(antes).toEqual(copia)
  })
})

describe('salvarFinanceiro', () => {
  const dados = { valor: 500000, fin: { forma: 'Misto' as const, financiado: 300000, entrada: 100000, fgts: 50000, proprios: 50000 } }

  it('grava valor e fontes e registra no histórico', () => {
    const p = proc(ok(salvarFinanceiro(novo(), ABERTO, dados, ator, quando)), ABERTO)
    expect(p.valor).toBe(500000)
    expect(p.fin).toEqual(dados.fin)
    expect(p.hist[0]!.acao).toBe('Atualizou o checklist comercial')
  })

  it('aceita fontes que não fecham (rascunho): quem confere é a tela', () => {
    const r = salvarFinanceiro(novo(), ABERTO, { ...dados, fin: { ...dados.fin, proprios: 0 } }, ator, quando)
    expect(r.ok).toBe(true)
  })

  it('À vista zera o financiado', () => {
    const p = proc(ok(salvarFinanceiro(novo(), ABERTO, { valor: 200000, fin: { forma: 'À vista', financiado: 999, entrada: 0, fgts: 0, proprios: 200000 } }, ator, quando)), ABERTO)
    expect(p.fin.financiado).toBe(0)
  })

  it('recusa negativo, valor zero e comissão menor que os adiantamentos', () => {
    expect(salvarFinanceiro(novo(), ABERTO, { ...dados, fin: { ...dados.fin, fgts: -1 } }, ator, quando).ok).toBe(false)
    expect(salvarFinanceiro(novo(), ABERTO, { ...dados, valor: 0 }, ator, quando).ok).toBe(false)
    // já adiantou R$ 6.000; 5% de 100.000 = 5.000
    expect(salvarFinanceiro(novo(), ABERTO, { ...dados, valor: 100000 }, ator, quando).ok).toBe(false)
  })

  it('recusa processo final e não muta a entrada', () => {
    const antes = novo()
    const copia = JSON.parse(JSON.stringify(antes))
    expect(salvarFinanceiro(antes, CONCLUIDO, dados, ator, quando).ok).toBe(false)
    salvarFinanceiro(antes, ABERTO, dados, ator, quando)
    expect(antes).toEqual(copia)
  })
})

describe('adiantamento: momento, pago e comprovante', () => {
  const base = { resp: 'imob' as const, valor: 100, data: '2026-11-15' }

  it('grava momento, pago e comprovante; padrão é adiantamento não pago', () => {
    const a = proc(ok(registrarAdiantamento(novo(), ABERTO, base, ator, quando)), ABERTO).adiantamentos.at(-1)!
    expect(a).toMatchObject({ momento: 'adiantamento', pago: false, comprovante: null })
    const b = proc(ok(registrarAdiantamento(novo(), ABERTO, { ...base, momento: 'fim-contrato', pago: true, comprovante: 'pix.pdf' }, ator, quando)), ABERTO).adiantamentos.at(-1)!
    expect(b).toMatchObject({ momento: 'fim-contrato', pago: true, comprovante: 'pix.pdf' })
  })

  it('recusa «pago» sem comprovante', () => {
    for (const comprovante of [undefined, null, '  ']) {
      expect(registrarAdiantamento(novo(), ABERTO, { ...base, pago: true, comprovante }, ator, quando)).toEqual({ ok: false, erro: MSG_PAGO_SEM_COMPROVANTE })
    }
  })
})

describe('salvarFinanceiro: campos da Olmi', () => {
  const fin = { forma: 'Misto' as const, financiado: 300000, entrada: 100000, fgts: 0, proprios: 50000, avaliacao: 520000, ganho: 'Há ganho de capital' as const, bem: 'Carro Onix 2020', valorBem: 50000 }

  it('grava avaliação, ganho de capital e bem', () => {
    const p = proc(ok(salvarFinanceiro(novo(), ABERTO, { valor: 500000, fin }, ator, quando)), ABERTO)
    expect(p.fin).toMatchObject({ avaliacao: 520000, ganho: 'Há ganho de capital' as const, bem: 'Carro Onix 2020', valorBem: 50000 })
  })

  it('recusa valor de bem sem descrição e negativos nos campos novos', () => {
    expect(salvarFinanceiro(novo(), ABERTO, { valor: 500000, fin: { ...fin, bem: '' } }, ator, quando).ok).toBe(false)
    expect(salvarFinanceiro(novo(), ABERTO, { valor: 500000, fin: { ...fin, avaliacao: -1 } }, ator, quando).ok).toBe(false)
  })
})

describe('salvarPessoa', () => {
  const dados = { cpf: '123.456.789-09', telefone: '(11) 98888-7777', email: 'a@b.com' }

  it('grava no vendedor sem tocar no comprador e registra no histórico', () => {
    const antes = proc(novo(), ABERTO)
    const p = proc(ok(salvarPessoa(novo(), ABERTO, 'vendedor', dados, ator, quando)), ABERTO)
    expect(p.vendedor).toMatchObject({ nome: antes.vendedor.nome, ...dados })
    expect(p.comprador).toEqual(antes.comprador)
    expect(p.hist[0]!.acao).toContain('vendedor')
  })

  it('aceita campos vazios, recusa formato inválido', () => {
    expect(salvarPessoa(novo(), ABERTO, 'comprador', { cpf: '', telefone: '', email: '' }, ator, quando).ok).toBe(true)
    expect(salvarPessoa(novo(), ABERTO, 'comprador', { ...dados, cpf: '123' }, ator, quando).ok).toBe(false)
    expect(salvarPessoa(novo(), ABERTO, 'comprador', { ...dados, telefone: '1234' }, ator, quando).ok).toBe(false)
    expect(salvarPessoa(novo(), ABERTO, 'comprador', { ...dados, email: 'sem-arroba' }, ator, quando).ok).toBe(false)
  })

  it('recusa processo final e não muta a entrada', () => {
    const antes = novo()
    const copia = JSON.parse(JSON.stringify(antes))
    expect(salvarPessoa(antes, CONCLUIDO, 'vendedor', dados, ator, quando).ok).toBe(false)
    salvarPessoa(antes, ABERTO, 'vendedor', dados, ator, quando)
    expect(antes).toEqual(copia)
  })
})

describe('imóvel e checklist da etapa 4', () => {
  it('itens das etapas 6 e 7 são só marcação de tela', () => {
    expect(itensChecklist(6)).toHaveLength(3)
    expect(itensChecklist(7)).toHaveLength(3)
    expect(itensChecklist(2)).toEqual([]) // 2 a 5 têm arquivo: ver requisitos.test.ts
  })

  it('salvarImovel grava matrícula-mãe e valor venal; recusa venal negativo', () => {
    const p = proc(ok(salvarImovel(novo(), ABERTO, { matriculaMae: true, valorVenal: 300000 }, ator, quando)), ABERTO)
    expect(p.matriculaMae).toBe(true)
    expect((p as { valorVenal?: number }).valorVenal).toBe(300000)
    expect(salvarImovel(novo(), ABERTO, { matriculaMae: false, valorVenal: -1 }, ator, quando).ok).toBe(false)
  })
})

describe('salvarConferenciaFinal', () => {
  const tudo = { documentacao: true, valores: true, comissao: true, encaminhado: true, responsavel: 'Marina Alves', data: '2026-11-15' }

  it('grava e registra o encaminhamento no histórico', () => {
    const p = proc(ok(salvarConferenciaFinal(novo(), ABERTO, tudo, ator, quando)), ABERTO)
    expect(p.conferenciaFinal).toEqual(tudo)
    expect(p.hist[0]!.acao).toContain('Encaminhou')
  })

  it.each(['documentacao', 'valores', 'comissao'] as const)('não encaminha com «%s» em aberto', (k) => {
    expect(salvarConferenciaFinal(novo(), ABERTO, { ...tudo, [k]: false }, ator, quando).ok).toBe(false)
  })

  it('permite salvar parcial sem encaminhar; exige responsável e data válida', () => {
    expect(salvarConferenciaFinal(novo(), ABERTO, { ...tudo, valores: false, comissao: false, encaminhado: false }, ator, quando).ok).toBe(true)
    expect(salvarConferenciaFinal(novo(), ABERTO, { ...tudo, responsavel: ' ' }, ator, quando).ok).toBe(false)
    expect(salvarConferenciaFinal(novo(), ABERTO, { ...tudo, data: '' }, ator, quando).ok).toBe(false)
  })

  it('recusa processo final e não muta a entrada', () => {
    const antes = novo()
    const copia = JSON.parse(JSON.stringify(antes))
    expect(salvarConferenciaFinal(antes, CANCELADO, tudo, ator, quando).ok).toBe(false)
    salvarConferenciaFinal(antes, ABERTO, tudo, ator, quando)
    expect(antes).toEqual(copia)
  })
})
