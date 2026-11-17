import { dataDoAtualizado } from './dashboard.ts'
import type { Locacao, Processo } from './types'

/**
 * Histórico de alterações: todos os eventos de `hist` de vendas e locações numa lista só.
 *
 * Inclui contratos arquivados (auditoria que esconde o arquivo não serve) e não depende
 * de quem está logado: a tela é só de quem tem a permissão `auditoria`, e essa pessoa
 * enxerga todos os corretores. No backend isto vira uma tabela append-only; aqui é a
 * mesma visão montada sobre o estado local.
 */

export interface EventoAuditoria {
  contratoId: string
  tipo: 'venda' | 'locacao'
  imovel: string
  acao: string
  quem: string
  /** texto de exibição, `dd/mm/aaaa hh:mm` */
  quando: string
  /** `aaaa-mm-dd hh:mm`, para ordenar e comparar */
  chave: string
  arquivado: boolean
}

export interface FiltroAuditoria {
  q: string
  /** '' = todos */
  quem: string
  /** '' = vendas e locações */
  tipo: '' | 'venda' | 'locacao'
  /** ISO yyyy-mm-dd, inclusivo; '' = sem limite */
  de: string
  ate: string
}

export const FILTRO_AUDITORIA_VAZIO: FiltroAuditoria = { q: '', quem: '', tipo: '', de: '', ate: '' }

function chaveDe(quando: string): string {
  const dia = dataDoAtualizado(quando)
  const hora = /(\d{2}:\d{2})\s*$/.exec(quando)?.[1] ?? '00:00'
  return dia ? `${dia} ${hora}` : ''
}

/** Mais recente primeiro; empate mantém a ordem em que o evento foi registrado (o último vem antes). */
export function eventosAuditoria(processos: Processo[], locacoes: Locacao[]): EventoAuditoria[] {
  const de = <T extends { id: string; imovel: string; hist: Processo['hist']; arquivado: boolean }>(
    tipo: EventoAuditoria['tipo'],
    c: T,
  ) =>
    c.hist.map((h, i) => ({
      i,
      e: { contratoId: c.id, tipo, imovel: c.imovel, acao: h.acao, quem: h.quem, quando: h.quando, chave: chaveDe(h.quando), arquivado: c.arquivado } satisfies EventoAuditoria,
    }))
  const todos = [...processos.flatMap((p) => de('venda', p)), ...locacoes.flatMap((l) => de('locacao', l))]
  return todos
    .sort((a, b) => b.e.chave.localeCompare(a.e.chave) || b.i - a.i)
    .map((x) => x.e)
}

export function pessoasDaAuditoria(eventos: EventoAuditoria[]): string[] {
  return [...new Set(eventos.map((e) => e.quem))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarAuditoria(eventos: EventoAuditoria[], f: FiltroAuditoria): EventoAuditoria[] {
  const termos = sem(f.q).split(/\s+/).filter(Boolean)
  return eventos.filter((e) => {
    if (f.quem && e.quem !== f.quem) return false
    if (f.tipo && e.tipo !== f.tipo) return false
    const dia = e.chave.slice(0, 10)
    if (f.de && (!dia || dia < f.de)) return false
    if (f.ate && (!dia || dia > f.ate)) return false
    if (!termos.length) return true
    const texto = sem([e.contratoId, e.imovel, e.acao, e.quem].join(' | '))
    return termos.every((t) => texto.includes(t))
  })
}
