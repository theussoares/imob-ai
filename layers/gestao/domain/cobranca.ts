import { diasEntre } from './avisos-locacao.ts'
import type { Cobranca, FormaPagamentoCobranca, Locacao, Pagamento } from './types'

/**
 * Situação, encargos e pagamentos de uma cobrança de aluguel: a ÚNICA fonte para o Financeiro, a
 * tela da locação e os avisos. Antes cada tela decidia por conta própria, e a mesma cobrança vencida
 * aparecia «Em atraso» no Financeiro e «Em aberto» na locação.
 *
 * `hoje` é sempre o dia no fuso do painel (`hojeISO(agoraNoFuso())`), nunca `toISOString()`.
 *
 * Decisões (a confirmar com o cliente; o que está aqui é o mais simples que fecha a conta):
 * - Multa e juros incidem sobre o VALOR ORIGINAL da cobrança, não sobre o saldo. Pagamento parcial
 *   não «abate» encargo: ele só reduz o que falta pagar. Evita recalcular juros sobre juros.
 * - Dia de atraso = dias a partir do dia SEGUINTE ao vencimento. Pagar no vencimento não tem encargo.
 * - Juros: % ao mês, pro rata por dia sobre 30 dias (simples, sem capitalização).
 * - Os encargos ficam com a imobiliária; o repasse ao locador é do aluguel original menos a taxa de
 *   administração, e só é liberado depois de a cobrança estar quitada.
 */

export interface EncargosConfig {
  /** multa única por atraso, % do valor */
  multaPct: number
  /** juros por mês de atraso, %, pro rata por dia */
  jurosMesPct: number
}

/** Aplicados quando a imobiliária não configurou nada. */
export const ENCARGOS_PADRAO: EncargosConfig = { multaPct: 2, jurosMesPct: 1 }

export const FORMAS_PAGAMENTO: FormaPagamentoCobranca[] = ['PIX', 'Dinheiro', 'Transferência', 'Boleto', 'Outro']

const centavos = (n: number) => Math.round(n * 100) / 100

export interface Encargos {
  /** dias corridos de atraso (0 = em dia) */
  dias: number
  multa: number
  juros: number
  /** valor original + multa + juros */
  atualizado: number
}

/** Valor atualizado de `valor` vencido em `vencimento`, visto em `ref` (ISO). */
export function calcularEncargos(valor: number, vencimento: string, ref: string, cfg: EncargosConfig = ENCARGOS_PADRAO): Encargos {
  const d = diasEntre(vencimento, ref)
  const dias = Number.isFinite(d) && d > 0 ? d : 0
  if (!dias) return { dias: 0, multa: 0, juros: 0, atualizado: centavos(valor) }
  const multa = centavos((valor * cfg.multaPct) / 100)
  const juros = centavos((valor * (cfg.jurosMesPct / 100) * dias) / 30)
  return { dias, multa, juros, atualizado: centavos(valor + multa + juros) }
}

export const totalPago = (c: Pick<Cobranca, 'pagamentos'>): number => centavos((c.pagamentos ?? []).reduce((t, p) => t + p.valor, 0))

export type SituacaoCobranca = 'paga' | 'parcial' | 'atrasada' | 'aberta'
export const ROTULO_SITUACAO_COBRANCA: Record<SituacaoCobranca, string> = { paga: 'Paga', parcial: 'Parcial', atrasada: 'Em atraso', aberta: 'Em aberto' }

/**
 * `paga` = quitada (`pago` preenchido: o marcador que já existia e que os avisos e o recorte sem
 * valores usam). `parcial` = recebeu parte e ainda deve. Vencida e sem pagamento = `atrasada`.
 * Parcial vencida continua `parcial` (o texto do atraso vem de `calcularEncargos`).
 */
export function situacaoCobranca(c: Cobranca, hoje: string): SituacaoCobranca {
  if (c.pago) return 'paga'
  if (totalPago(c) > 0) return 'parcial'
  return diasEntre(hoje, c.vencimento) < 0 ? 'atrasada' : 'aberta'
}

export interface Devido {
  situacao: SituacaoCobranca
  valorOriginal: number
  encargos: Encargos
  /** já recebido */
  pago: number
  /** o que falta pagar hoje: atualizado menos o pago (0 se quitada) */
  saldo: number
  vencida: boolean
}

export function devidoDaCobranca(c: Cobranca, hoje: string, cfg: EncargosConfig = ENCARGOS_PADRAO): Devido {
  const situacao = situacaoCobranca(c, hoje)
  // Quitada não acumula mais encargo: congela na data do último pagamento.
  const ref = c.pago ? c.pago.data : hoje
  const encargos = calcularEncargos(c.valor, c.vencimento, ref, cfg)
  const pago = totalPago(c)
  return {
    situacao,
    valorOriginal: c.valor,
    encargos,
    pago,
    saldo: situacao === 'paga' ? 0 : Math.max(0, centavos(encargos.atualizado - pago)),
    vencida: diasEntre(hoje, c.vencimento) < 0,
  }
}

export interface DadosPagamento {
  valor: number
  /** ISO yyyy-mm-dd */
  data: string
  forma: FormaPagamentoCobranca
  comprovante?: string | null
}

/** Valida um pagamento/repasse. `hoje` ISO. Devolve a frase de erro ou `null`. */
export function validarPagamento(d: DadosPagamento, hoje: string): string | null {
  if (typeof d.valor !== 'number' || !Number.isFinite(d.valor) || d.valor <= 0) return 'Informe um valor maior que zero.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || Number.isNaN(Date.parse(d.data))) return 'Informe a data.'
  if (d.data > hoje) return 'A data não pode ser futura.'
  if (!FORMAS_PAGAMENTO.includes(d.forma)) return 'Escolha a forma de pagamento.'
  return null
}

/** Soma o pagamento e diz se quitou, pelo valor atualizado NA DATA do pagamento. */
export function aplicarPagamento(c: Cobranca, p: Pagamento, cfg: EncargosConfig = ENCARGOS_PADRAO): { cobranca: Cobranca; quitou: boolean; atualizado: number } {
  const pagamentos = [...(c.pagamentos ?? []), p]
  const atualizado = calcularEncargos(c.valor, c.vencimento, p.data, cfg).atualizado
  const quitou = totalPago({ pagamentos }) + 0.004 >= atualizado
  return { cobranca: { ...c, pagamentos }, quitou, atualizado }
}

/** Cobrança da locação por id, para as telas que só têm os dois ids. */
export const cobrancaDe = (l: Locacao, id: string) => l.cobrancas.find((c) => c.id === id)

// ---- Contrato do modal de recebimento (pagamento e repasse) ----
export interface DadosRecebimentoForm {
  valor: number
  data: string
  forma: FormaPagamentoCobranca
  comprovante: string | null
}
export interface ContextoRecebimento {
  modo: 'pagamento' | 'repasse'
  titulo: string
  /** valor sugerido (editável) */
  sugerido: number
  /** linhas de resumo exibidas acima do formulário (original, multa, juros...) */
  resumo: { rotulo: string; valor: number }[]
}
