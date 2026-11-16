import { describe, expect, it } from 'vitest'
import type { Estado } from '../../domain/acoes'
import { mudarStatus } from '../../domain/acoes'
import { arquivarProcesso, restaurarProcesso, salvarAbertura, salvarObservacao } from '../../domain/acoes-ciclo'
import { documentosSeedCompleto, processosSeed } from '../../domain/seed'

const ator = { nome: 'Paulo Ribeiro' }
const novo = (): Estado => ({ processos: processosSeed(), documentos: documentosSeedCompleto() })
const ok = (r: { ok: boolean; estado?: Estado; erro?: string }) => {
  if (!r.ok) throw new Error(r.erro)
  return r.estado!
}
const proc = (e: Estado, id: string) => e.processos.find((p) => p.id === id)!
const base = (id: string) => {
  const p = proc(novo(), id)
  return {
    vendedor: { nome: p.vendedor.nome, cpf: p.vendedor.cpf },
    comprador: { nome: p.comprador.nome, cpf: p.comprador.cpf },
    imovel: p.imovel,
    corretorId: p.corretorId,
    captadorId: p.captadorId,
    preliminar: { existe: false, arquivo: null },
  }
}

describe('salvarAbertura', () => {
  it('grava os dados, o contrato preliminar e o histórico, preservando o contato', () => {
    const d = { ...base('V-2026-0142'), imovel: 'Apto novo', preliminar: { existe: true, arquivo: 'prelim.pdf' } }
    const p = proc(ok(salvarAbertura(novo(), 'V-2026-0142', d, ator, '15/11/2026 10:00')), 'V-2026-0142')
    expect(p.imovel).toBe('Apto novo')
    expect(p.preliminar).toEqual({ existe: true, arquivo: 'prelim.pdf' })
    expect(p.vendedor.telefone).toBeTruthy()
    expect(p.hist[0]!.acao).toBe('Atualizou os dados da abertura')
  })

  it('desmarcar o preliminar descarta o arquivo', () => {
    const d = { ...base('V-2026-0142'), preliminar: { existe: false, arquivo: 'sobrou.pdf' } }
    expect(proc(ok(salvarAbertura(novo(), 'V-2026-0142', d, ator)), 'V-2026-0142').preliminar).toEqual({ existe: false, arquivo: null })
  })

  it('recusa nome vazio, CPF malformado e preliminar que não é PDF', () => {
    const b = base('V-2026-0142')
    expect(salvarAbertura(novo(), 'V-2026-0142', { ...b, vendedor: { nome: ' ', cpf: '' } }, ator).ok).toBe(false)
    expect(salvarAbertura(novo(), 'V-2026-0142', { ...b, comprador: { ...b.comprador, cpf: '123' } }, ator).ok).toBe(false)
    expect(salvarAbertura(novo(), 'V-2026-0142', { ...b, preliminar: { existe: true, arquivo: 'a.exe' } }, ator).ok).toBe(false)
  })

  it('processo encerrado é só leitura', () => {
    expect(salvarAbertura(novo(), 'V-2026-0133', base('V-2026-0133'), ator).ok).toBe(false)
  })
})

describe('salvarObservacao', () => {
  it('grava e limita o tamanho', () => {
    expect(proc(ok(salvarObservacao(novo(), 'V-2026-0142', '  Matrícula ok  ', ator)), 'V-2026-0142').obs).toBe('Matrícula ok')
    expect(salvarObservacao(novo(), 'V-2026-0142', 'x'.repeat(2001), ator).ok).toBe(false)
  })
})

describe('arquivar e restaurar', () => {
  it('só arquiva contrato concluído ou cancelado; ativo é recusado', () => {
    expect(arquivarProcesso(novo(), 'V-2026-0142', ator).ok).toBe(false)
    const e = ok(arquivarProcesso(novo(), 'V-2026-0133', ator, '15/11/2026 11:00'))
    expect(proc(e, 'V-2026-0133').arquivado).toBe(true)
    expect(proc(e, 'V-2026-0133').hist[0]!.acao).toBe('Arquivou o contrato')
    expect(arquivarProcesso(e, 'V-2026-0133', ator).ok).toBe(false) // já arquivado
  })

  it('cancelar pelo status e depois arquivar funciona; restaurar volta', () => {
    const cancelado = ok(mudarStatus(novo(), 'V-2026-0155', 'Venda cancelada', ator))
    const arq = ok(arquivarProcesso(cancelado, 'V-2026-0155', ator))
    const volta = ok(restaurarProcesso(arq, 'V-2026-0155', ator))
    expect(proc(volta, 'V-2026-0155').arquivado).toBe(false)
    expect(restaurarProcesso(volta, 'V-2026-0155', ator).ok).toBe(false)
  })
})
