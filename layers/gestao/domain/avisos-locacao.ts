import type { Locacao } from './types'

/**
 * Avisos da locação: fim de contrato (marcos de 90, 60 e 30 dias) e aluguel a vencer
 * ou em atraso. Pedido da reunião de 15/11 com a Olmi.
 *
 * Função pura sobre `hoje` (ISO): a data entra por parâmetro para o teste não depender
 * do relógio e porque, no backend, quem vai calcular é um job diário — a regra tem que
 * sair daqui sem mudar. Os avisos nunca citam valor em R$: a recepção não tem a permissão
 * `valores` e precisa saber que o aluguel venceu sem ver quanto é.
 */

export type NivelAviso = 'info' | 'atencao' | 'urgente' | 'vencido'

export interface AvisoLocacao {
  tipo: 'fim-contrato' | 'aluguel'
  nivel: NivelAviso
  texto: string
  /** dias até o evento; negativo = já passou */
  dias: number
}

/** Marcos de aviso de fim de contrato, em dias. */
export const MARCOS_FIM_CONTRATO = [90, 60, 30] as const

/** Quantos dias antes do vencimento o aluguel em aberto começa a ser avisado. */
export const ANTECEDENCIA_ALUGUEL = 5

const MS_DIA = 86_400_000
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

function utc(iso: string): number {
  const m = ISO.exec(iso)
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) : Number.NaN
}

/** Dias corridos de `de` até `ate` (ambos ISO yyyy-mm-dd). Negativo se `ate` é anterior. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((utc(ate) - utc(de)) / MS_DIA)
}

/** Data de hoje no fuso local, em ISO. `toISOString` daria o dia seguinte à noite no Brasil. */
export function hojeISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** `2026-11-17` somado de `dias`. */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(utc(iso) + dias * MS_DIA)
  return d.toISOString().slice(0, 10)
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios)
const dias = (n: number) => `${n} ${plural(n, 'dia', 'dias')}`
const mesAno = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`

const PESO: Record<NivelAviso, number> = { vencido: 0, urgente: 1, atencao: 2, info: 3 }

function avisoFim(fim: string, hoje: string): AvisoLocacao | null {
  const d = diasEntre(hoje, fim)
  if (Number.isNaN(d)) return null
  if (d < 0) return { tipo: 'fim-contrato', nivel: 'vencido', dias: d, texto: `O contrato venceu há ${dias(-d)}. Renove ou encerre a locação.` }
  const [m90, m60, m30] = MARCOS_FIM_CONTRATO
  const nivel: NivelAviso | null = d <= m30 ? 'urgente' : d <= m60 ? 'atencao' : d <= m90 ? 'info' : null
  if (!nivel) return null
  return {
    tipo: 'fim-contrato',
    nivel,
    dias: d,
    texto: d === 0 ? 'O contrato termina hoje.' : `O contrato termina em ${dias(d)}.`,
  }
}

function avisoAluguel(competencia: string, vencimento: string, hoje: string): AvisoLocacao | null {
  const d = diasEntre(hoje, vencimento)
  if (Number.isNaN(d)) return null
  const ref = mesAno(competencia)
  if (d < 0) return { tipo: 'aluguel', nivel: 'vencido', dias: d, texto: `Aluguel de ${ref} em atraso há ${dias(-d)}.` }
  if (d > ANTECEDENCIA_ALUGUEL) return null
  return {
    tipo: 'aluguel',
    nivel: 'atencao',
    dias: d,
    texto: d === 0 ? `Aluguel de ${ref} vence hoje.` : `Aluguel de ${ref} vence em ${dias(d)}.`,
  }
}

/**
 * Avisos de uma locação, do mais grave ao mais leve. Só locação ativa e não arquivada
 * avisa: antes do contrato não há prazo, e encerrada já não cobra nada.
 */
export function avisosLocacao(l: Locacao, hoje: string): AvisoLocacao[] {
  if (l.arquivado || l.status !== 'Ativa' || !l.contrato) return []
  const out: AvisoLocacao[] = []
  const fim = avisoFim(l.contrato.fim, hoje)
  if (fim) out.push(fim)
  for (const c of l.cobrancas) {
    if (c.pago) continue
    const a = avisoAluguel(c.competencia, c.vencimento, hoje)
    if (a) out.push(a)
  }
  return out.sort((a, b) => PESO[a.nivel] - PESO[b.nivel] || a.dias - b.dias)
}

/** O aviso mais grave, para o selo do card. */
export function avisoPrincipal(l: Locacao, hoje: string): AvisoLocacao | null {
  return avisosLocacao(l, hoje)[0] ?? null
}

/** Total de avisos nas locações, para o contador do menu e do dashboard. */
export function contarAvisos(locacoes: Locacao[], hoje: string): number {
  return locacoes.reduce((n, l) => n + avisosLocacao(l, hoje).length, 0)
}
