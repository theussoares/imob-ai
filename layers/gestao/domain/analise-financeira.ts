import type { AnaliseFinanceira, StatusAnaliseFin } from './types'

/**
 * Análise do financeiro: o corretor preenche livremente, mas o que ele preencheu só vale depois de passar por
 * quem tem `valores` (Jurídico e Dono). Regras puras, iguais para venda e locação; quem aplica ao contrato é
 * `acoes-analise.ts` (venda) e `acoes-locacao.ts`.
 */

export const ROTULO_ANALISE: Record<StatusAnaliseFin, string> = {
  rascunho: 'Rascunho',
  'em-analise': 'Em análise',
  aprovado: 'Aprovado',
  devolvido: 'Devolvido',
}

/** O corretor só mexe no financeiro antes de enviar e depois de uma devolução. Sem análise (legado) não há trava. */
export const analiseEditavel = (a: AnaliseFinanceira | undefined): boolean => !a || a.status === 'rascunho' || a.status === 'devolvido'

/** Contrato aberto por quem não tem `valores` já nasce em rascunho; quem tem `valores` não passa por análise. */
export const analiseNascente = (temValores: boolean): AnaliseFinanceira | undefined => (temValores ? undefined : { status: 'rascunho' })

export type ResultadoAnalise = { ok: true; analise: AnaliseFinanceira; acao: string } | { ok: false; erro: string }

export const MOTIVO_MAX = 500

export function enviarAnalise(atual: AnaliseFinanceira | undefined, ator: string, quando: string): ResultadoAnalise {
  if (atual?.status === 'em-analise') return { ok: false, erro: 'O financeiro já está em análise.' }
  if (atual?.status === 'aprovado') return { ok: false, erro: 'O financeiro já foi aprovado.' }
  return { ok: true, acao: 'Enviou o financeiro para análise', analise: { status: 'em-analise', enviadoPor: ator, enviadoEm: quando } }
}

export function aprovarAnalise(atual: AnaliseFinanceira | undefined, ator: string, quando: string): ResultadoAnalise {
  if (atual?.status !== 'em-analise') return { ok: false, erro: 'Só dá para aprovar um financeiro que está em análise.' }
  return { ok: true, acao: 'Aprovou a análise do financeiro', analise: { status: 'aprovado', enviadoPor: atual.enviadoPor, enviadoEm: atual.enviadoEm, decididoPor: ator, decididoEm: quando } }
}

export function devolverAnalise(atual: AnaliseFinanceira | undefined, motivo: string, ator: string, quando: string): ResultadoAnalise {
  if (atual?.status !== 'em-analise') return { ok: false, erro: 'Só dá para devolver um financeiro que está em análise.' }
  const m = motivo.trim()
  if (!m) return { ok: false, erro: 'Diga o que precisa ser corrigido.' }
  if (m.length > MOTIVO_MAX) return { ok: false, erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` }
  return { ok: true, acao: 'Devolveu a análise do financeiro', analise: { status: 'devolvido', enviadoPor: atual.enviadoPor, enviadoEm: atual.enviadoEm, decididoPor: ator, decididoEm: quando, motivo: m } }
}

/** Texto que impede finalizar, ou `null`. Ausente (legado) não bloqueia; qualquer coisa diferente de aprovado, sim. */
export function bloqueioFinalizacao(a: AnaliseFinanceira | undefined): string | null {
  if (!a || a.status === 'aprovado') return null
  return 'O financeiro ainda não foi aprovado. Envie para análise e aguarde a aprovação antes de finalizar.'
}
