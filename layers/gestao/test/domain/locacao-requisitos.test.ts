import { describe, expect, it } from 'vitest'
import { pendenciasEtapaLocacao, requisitosDaEtapaLocacao } from '../../domain/locacao-requisitos'
import type { Documento, Locacao } from '../../domain/types'

const pessoa = (nome: string) => ({ nome, cpf: '111.222.333-44', telefone: '(11) 91234-5678', email: `${nome}@x.com` })

function loc(o: Partial<Locacao> = {}): Locacao {
  return {
    id: 'L-2026-0001', tipo: 'locacao', locador: pessoa('ana'), locatario: pessoa('beto'), imovelId: 'i1',
    imovel: 'Casa 1', corretorId: 'c1', status: 'Em abertura', updated: '', etapa: 1,
    concluidas: Array(8).fill(false), cobrancas: [], hist: [], obs: '', arquivado: false, ...o,
  }
}
const doc = (requisito: string): Documento => ({
  id: requisito, nome: 'a.pdf', categoria: 'pessoas', processoId: 'L-2026-0001', estado: 'enviado',
  tamanho: 1, versoes: 1, enviadoPor: 'x', requisito, apagado: null,
})
const vistoria = (fotos: string[]) => ({ data: '2026-11-01', responsavel: 'Marina', fotos, observacao: '' })

describe('requisitos da locação', () => {
  it('lista os itens por etapa', () => {
    expect(requisitosDaEtapaLocacao(2).map((r) => r.chave)).toEqual(['locatario:rg-cnh', 'locatario:renda', 'locatario:residencia'])
    expect(requisitosDaEtapaLocacao(3)).toHaveLength(3)
    expect(requisitosDaEtapaLocacao(4)).toHaveLength(3)
    expect(requisitosDaEtapaLocacao(5).map((r) => r.chave)).toEqual(['locacao:garantia'])
    expect(requisitosDaEtapaLocacao(6)).toEqual([])
    expect(requisitosDaEtapaLocacao(7)).toEqual([])
  })
})

describe('pendências da locação', () => {
  it('etapa 1 pede locador, locatário e imóvel', () => {
    const p = pendenciasEtapaLocacao(loc({ locador: pessoa(''), locatario: pessoa(''), imovel: '' }), [], 1)
    expect(p).toEqual(['Informe o locador.', 'Informe o locatário.', 'Informe o imóvel.'])
  })

  it('etapas 2 e 3 pedem CPF, telefone e e-mail e os arquivos', () => {
    const l = loc({ locatario: { nome: 'b', cpf: '' } })
    const p = pendenciasEtapaLocacao(l, [], 2)
    expect(p).toContain('Preencha o CPF do locatário e salve o cadastro.')
    expect(p).toContain('Preencha o telefone do locatário e salve o cadastro.')
    expect(p).toContain('Preencha o e-mail do locatário e salve o cadastro.')
    expect(p.at(-1)).toBe('Faltam 3 documentos: RG ou CNH, Comprovante de renda, Comprovante de residência.')
    expect(pendenciasEtapaLocacao(loc(), [doc('locatario:rg-cnh'), doc('locatario:renda')], 2)).toEqual([
      'Falta enviar 1 documento: Comprovante de residência.',
    ])
  })

  it('etapa 5 pede garantia e arquivo', () => {
    expect(pendenciasEtapaLocacao(loc(), [], 5)[0]).toBe('Escolha o tipo de garantia e salve.')
    expect(pendenciasEtapaLocacao(loc({ garantia: { tipo: 'Caução', detalhe: '' } }), [doc('locacao:garantia')], 5)).toEqual([])
  })

  it('etapa 6 pede vistoria de entrada com foto', () => {
    expect(pendenciasEtapaLocacao(loc(), [], 6)).toEqual(['Registre a vistoria de entrada.'])
    expect(pendenciasEtapaLocacao(loc({ vistoriaEntrada: vistoria([]) }), [], 6)).toEqual(['Anexe ao menos uma foto da vistoria.'])
    expect(pendenciasEtapaLocacao(loc({ vistoriaEntrada: vistoria(['a.jpg']) }), [], 6)).toEqual([])
  })

  it('etapa 7 pede os dados do contrato', () => {
    expect(pendenciasEtapaLocacao(loc(), [], 7)).toEqual(['Salve os dados do contrato.'])
  })
})
