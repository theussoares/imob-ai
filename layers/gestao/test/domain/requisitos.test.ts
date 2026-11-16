import { describe, expect, it } from 'vitest'
import { concluirEtapa, enviarDocumento, type Estado } from '../../domain/acoes'
import { conferirDocumento } from '../../domain/acoes'
import { salvarFinanceiro, salvarImovel, salvarPessoa } from '../../domain/acoes-processo'
import {
  documentosPendentes,
  documentoDoRequisito,
  estadoRequisito,
  pendenciasEtapa,
  requisitosDaEtapa,
} from '../../domain/requisitos'
import { documentosSeedCompleto, processosSeed } from '../../domain/seed'

const ator = { nome: 'Marina Alves' }
const novo = (): Estado => ({ processos: processosSeed(), documentos: documentosSeedCompleto(), locacoes: [] })
const ok = (r: { ok: boolean; estado?: Estado; erro?: string }) => {
  if (!r.ok) throw new Error(r.erro)
  return r.estado!
}
const proc = (e: Estado, id: string) => e.processos.find((p) => p.id === id)!
const nomes = (p: Parameters<typeof requisitosDaEtapa>[0], etapa: number) => requisitosDaEtapa(p, etapa).map((r) => r.nome)

describe('itens por etapa', () => {
  const p = proc(novo(), 'V-2026-0151')

  it('pessoas: RG ou CNH, certidão e residência — e NUNCA o CPF como arquivo', () => {
    for (const etapa of [2, 3]) {
      expect(nomes(p, etapa)).toEqual(['RG ou CNH', 'Certidão de nascimento ou de casamento', 'Comprovante de residência'])
    }
  })

  it('matrícula-mãe troca a matrícula por mãe + projeto/prancha', () => {
    expect(nomes({ ...p, matriculaMae: false }, 4)).toContain('Matrícula atualizada')
    const mae = nomes({ ...p, matriculaMae: true }, 4)
    expect(mae).toContain('Matrícula-mãe')
    expect(mae).toContain('Projeto/prancha do imóvel')
    expect(mae).not.toContain('Matrícula atualizada')
  })

  it('etapa 5 só pede simulação, extrato e comprovante quando há financiamento, FGTS e entrada', () => {
    const avista = { ...p, fin: { forma: 'À vista' as const, financiado: 0, entrada: 0, fgts: 0, proprios: 1 } }
    expect(nomes(avista, 5)).toEqual(['Proposta assinada pelas partes'])
    const misto = { ...p, fin: { forma: 'Misto' as const, financiado: 1, entrada: 1, fgts: 1, proprios: 0 } }
    expect(nomes(misto, 5)).toHaveLength(4)
  })
})

describe('estado do item vem do arquivo', () => {
  it('sem arquivo = pendente; com arquivo, o estado do documento; lixeira reabre a pendência', () => {
    const e = novo()
    expect(estadoRequisito(e.documentos, 'V-2026-0151', 'vendedor:rg-cnh')).toBe('conferido')
    expect(estadoRequisito(e.documentos, 'V-2026-0151', 'comprador:rg-cnh')).toBe('enviado')
    expect(estadoRequisito(e.documentos, 'V-2026-0151', 'comprador:residencia')).toBe('pendente')
    const d = documentoDoRequisito(e.documentos, 'V-2026-0151', 'vendedor:rg-cnh')!
    const apagado = { ...e.documentos.find((x) => x.id === d.id)!, apagado: { quem: 'x', quando: 'y' } }
    const docs = e.documentos.map((x) => (x.id === d.id ? apagado : x))
    expect(estadoRequisito(docs, 'V-2026-0151', 'vendedor:rg-cnh')).toBe('pendente')
  })
})

describe('pendências que bloqueiam a conclusão', () => {
  it('etapa 2 exige CPF, telefone e e-mail do vendedor — o defeito relatado', () => {
    // 0155 só tem nome e CPF; nenhum arquivo foi enviado.
    const aberto = novo()
    const p = { ...proc(aberto, 'V-2026-0155'), etapa: 2 }
    const f = pendenciasEtapa(p, aberto.documentos, 2).join(' ')
    expect(f).toContain('telefone do vendedor')
    expect(f).toContain('e-mail do vendedor')
    expect(f).toContain('Faltam 3 documentos')
  })

  it('libera a etapa 3 depois de cadastro salvo e arquivos enviados, passo a passo', () => {
    let e = novo()
    const id = 'V-2026-0151'
    expect(concluirEtapa(e, id, 3, ator).ok).toBe(false)
    e = ok(salvarPessoa(e, id, 'comprador', { cpf: '445.902.118-03', telefone: '(11) 98888-7777', email: 'camila@exemplo.com' }, ator))
    expect(pendenciasEtapa(proc(e, id), e.documentos, 3)).toEqual([expect.stringContaining('Faltam 2 documentos')])
    for (const chave of ['comprador:certidao', 'comprador:residencia']) {
      e = ok(enviarDocumento(e, { nome: `${chave}.pdf`, categoria: 'pessoas', processoId: id, tamanho: 1000, requisito: chave }, ator))
    }
    expect(pendenciasEtapa(proc(e, id), e.documentos, 3)).toEqual([])
    const depois = proc(ok(concluirEtapa(e, id, 3, ator)), id)
    expect(depois.etapa).toBe(4)
  })

  it('etapa 4 exige valor venal e a matrícula do imóvel', () => {
    let e = novo()
    // 0158 está na etapa 5; usa a 0151 recuada artificialmente para a etapa 4.
    const id = 'V-2026-0151'
    const p = proc(e, id)
    expect(pendenciasEtapa(p, e.documentos, 4).join(' ')).toContain('Informe o valor venal')
    e = ok(salvarImovel(e, id, { matriculaMae: true, valorVenal: 250000 }, ator))
    const texto = pendenciasEtapa(proc(e, id), e.documentos, 4).join(' ')
    expect(texto).not.toContain('Informe o valor venal')
    expect(texto).toContain('Matrícula-mãe')
    expect(texto).toContain('Projeto/prancha do imóvel')
  })

  it('etapa 5 exige as fontes fechando o valor e os arquivos dos itens', () => {
    const e = novo()
    const p = proc(e, 'V-2026-0158') // 320.000 = 256.000 financiado + 64.000 entrada; falta o comprovante da entrada
    const texto = pendenciasEtapa(p, e.documentos, 5)
    expect(texto).toEqual([expect.stringContaining('Comprovante da entrada')])
    const furada = { ...p, fin: { ...p.fin, entrada: 1000 } }
    expect(pendenciasEtapa(furada, e.documentos, 5).join(' ')).toContain('fontes de pagamento precisam fechar')
  })

  it('etapa 6 só fecha com todos os arquivos conferidos', () => {
    const e = novo()
    const p = proc(e, 'V-2026-0158')
    expect(pendenciasEtapa(p, e.documentos, 6).join(' ')).toContain('sem conferência')
    const conferido = ok(conferirDocumento(e, documentoDoRequisito(e.documentos, p.id, 'fin:proposta')!.id))
    // ainda falta a entrada (pendente): continua bloqueado
    expect(pendenciasEtapa(proc(conferido, p.id), conferido.documentos, 6)).not.toEqual([])
  })
})

describe('envio ligado ao item', () => {
  it('o item manda na categoria e entra no histórico do processo', () => {
    const e = ok(
      enviarDocumento(
        novo(),
        { nome: 'proposta.pdf', categoria: 'pessoas', processoId: 'V-2026-0158', tamanho: 5, requisito: 'fin:entrada' },
        ator,
        '15/11/2026 10:00',
      ),
    )
    expect(e.documentos[0]).toMatchObject({ requisito: 'fin:entrada', categoria: 'financeiro', estado: 'enviado' })
    expect(proc(e, 'V-2026-0158').hist[0]!.acao).toBe('Enviou o documento: Comprovante da entrada')
  })

  it('item inexistente é recusado', () => {
    const r = enviarDocumento(novo(), { nome: 'a.pdf', categoria: 'pessoas', processoId: 'V-2026-0158', tamanho: 5, requisito: 'xx:yy' }, ator)
    expect(r.ok).toBe(false)
  })
})

describe('pendências do card da lista', () => {
  it('conta itens de pessoas e imóvel sem arquivo; encerrado não conta', () => {
    const e = novo()
    expect(documentosPendentes(proc(e, 'V-2026-0155'), e.documentos)).toBe(9) // nada enviado
    expect(documentosPendentes(proc(e, 'V-2026-0142'), e.documentos)).toBe(0)
    expect(documentosPendentes(proc(e, 'V-2026-0147'), e.documentos)).toBe(0) // cancelado
  })
})

describe('salvarFinanceiro continua valendo para a lista de itens', () => {
  it('trocar a forma para à vista tira a simulação da lista', () => {
    const e = novo()
    const p = proc(e, 'V-2026-0158')
    const r = ok(
      salvarFinanceiro(e, p.id, { valor: p.valor, fin: { forma: 'À vista', financiado: 0, entrada: 0, fgts: 0, proprios: p.valor } }, ator),
    )
    expect(nomes(proc(r, p.id), 5)).toEqual(['Proposta assinada pelas partes'])
  })
})
