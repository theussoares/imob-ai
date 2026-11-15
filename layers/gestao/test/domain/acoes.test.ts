import { describe, expect, it } from 'vitest'
import {
  abrirProcesso,
  apagarDocumento,
  concluirEtapa,
  enviarDocumento,
  mudarStatus,
  proximoId,
  restaurarDocumento,
  substituirDocumento,
  type Estado,
} from '../../domain/acoes'
import { documentosSeed, processosSeed } from '../../domain/seed'
import { progresso, STATUS_VENDA, statusFinal } from '../../domain/status'

const ator = { nome: 'Marina Alves' }
const novo = (): Estado => ({ processos: processosSeed(), documentos: documentosSeed() })
const ok = (r: ReturnType<typeof abrirProcesso>) => {
  if (!r.ok) throw new Error(r.erro)
  return r.estado
}

describe('status e etapas', () => {
  it('são 13 status e só concluída/cancelada são finais', () => {
    expect(STATUS_VENDA).toHaveLength(13)
    expect(STATUS_VENDA.filter(statusFinal)).toEqual(['Venda concluída', 'Venda cancelada'])
  })

  it('progresso conta etapas concluídas', () => {
    expect(progresso([true, true, true, true, false, false, false, false])).toEqual({
      feitas: 4,
      pct: 50,
      texto: '4 de 8 etapas concluídas',
    })
  })
})

describe('abrir processo', () => {
  it('cria no topo da lista com id sequencial, status inicial e histórico', () => {
    const e = ok(abrirProcesso(novo(), { imovel: 'Casa X', vendedor: 'A', comprador: 'B', corretorId: 'c1' }, ator, '15/11/2026 10:00'))
    const p = e.processos[0]!
    expect(p.id).toBe(proximoId(novo().processos))
    expect(p.status).toBe('Em negociação')
    expect(p.etapa).toBe(1)
    expect(p.concluidas.every((c) => !c)).toBe(true)
    expect(p.hist[0]).toEqual({ acao: 'Abriu o processo', quem: 'Marina Alves', quando: '15/11/2026 10:00' })
  })

  it('o id nunca repete: sai acima do maior do ano', () => {
    expect(proximoId(processosSeed(), 2026)).toBe('V-2026-0159')
    expect(proximoId([], 2027)).toBe('V-2027-0001')
  })

  it.each([
    [{ imovel: '', vendedor: 'A', comprador: 'B' }, 'o imóvel'],
    [{ imovel: 'X', vendedor: '  ', comprador: 'B' }, 'o vendedor'],
    [{ imovel: 'X', vendedor: 'A', comprador: '' }, 'o comprador'],
  ])('recusa campo obrigatório vazio %#', (dados, quem) => {
    const r = abrirProcesso(novo(), { ...dados, corretorId: 'c1' }, ator)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toContain(quem)
  })

  it('não muta o estado de entrada', () => {
    const antes = novo()
    const copia = JSON.stringify(antes)
    abrirProcesso(antes, { imovel: 'X', vendedor: 'A', comprador: 'B', corretorId: 'c1' }, ator)
    expect(JSON.stringify(antes)).toBe(copia)
  })
})

describe('mudar status e concluir etapa', () => {
  it('muda o status e registra no histórico', () => {
    const e = ok(mudarStatus(novo(), 'V-2026-0155', 'Proposta aprovada', ator, '15/11/2026 11:00'))
    const p = e.processos.find((x) => x.id === 'V-2026-0155')!
    expect(p.status).toBe('Proposta aprovada')
    expect(p.hist[0]!.acao).toBe('Mudou o status para Proposta aprovada')
  })

  it('concluir a venda fecha as 8 etapas', () => {
    const e = ok(mudarStatus(novo(), 'V-2026-0142', 'Venda concluída', ator))
    const p = e.processos.find((x) => x.id === 'V-2026-0142')!
    expect(p.concluidas.every(Boolean)).toBe(true)
  })

  it('processo encerrado é só leitura: status e etapa são recusados', () => {
    const r1 = mudarStatus(novo(), 'V-2026-0133', 'Em negociação', ator)
    const r2 = concluirEtapa(novo(), 'V-2026-0147', 3, ator)
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
  })

  it('conclui só a etapa atual e avança; pular etapa é recusado', () => {
    const e = ok(concluirEtapa(novo(), 'V-2026-0151', 3, ator))
    const p = e.processos.find((x) => x.id === 'V-2026-0151')!
    expect(p.concluidas[2]).toBe(true)
    expect(p.etapa).toBe(4)
    expect(concluirEtapa(novo(), 'V-2026-0151', 5, ator).ok).toBe(false)
  })

  it('processo inexistente devolve erro, não exceção', () => {
    expect(mudarStatus(novo(), 'V-0000', 'Em negociação', ator).ok).toBe(false)
  })
})

describe('documentos e lixeira', () => {
  it('apagar vai para a lixeira com quem e quando; restaurar volta', () => {
    const apagado = ok(apagarDocumento(novo(), 'd1', ator, '15/11/2026 12:00'))
    expect(apagado.documentos.find((d) => d.id === 'd1')!.apagado).toEqual({ quem: 'Marina Alves', quando: '15/11/2026 12:00' })
    expect(apagado.documentos).toHaveLength(novo().documentos.length) // não exclui
    const volta = ok(restaurarDocumento(apagado, 'd1'))
    expect(volta.documentos.find((d) => d.id === 'd1')!.apagado).toBeNull()
  })

  it('não apaga duas vezes nem restaura o que não está na lixeira', () => {
    expect(apagarDocumento(novo(), 'd8', ator).ok).toBe(false) // d8 já está na lixeira
    expect(restaurarDocumento(novo(), 'd1').ok).toBe(false)
  })

  it('envio valida tipo, tamanho (20 MB) e processo', () => {
    const base = { nome: 'a.pdf', categoria: 'pessoas' as const, processoId: 'V-2026-0142', tamanho: 1000 }
    expect(enviarDocumento(novo(), base, ator).ok).toBe(true)
    expect(enviarDocumento(novo(), { ...base, nome: 'a.exe' }, ator).ok).toBe(false)
    expect(enviarDocumento(novo(), { ...base, tamanho: 20 * 1024 * 1024 + 1 }, ator).ok).toBe(false)
    expect(enviarDocumento(novo(), { ...base, processoId: 'nope' }, ator).ok).toBe(false)
    expect(enviarDocumento(novo(), { ...base, nome: ' ' }, ator).ok).toBe(false)
  })

  it('substituir cria nova versão e volta o estado para "enviado" (precisa reconferir)', () => {
    const e = ok(substituirDocumento(novo(), 'd1', 900))
    const d = e.documentos.find((x) => x.id === 'd1')!
    expect(d.versoes).toBe(2)
    expect(d.estado).toBe('enviado')
  })
})
