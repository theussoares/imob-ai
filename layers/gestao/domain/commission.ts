import type { Adiantamento, Processo, ResponsavelAdiantamento } from './types'

export const DIVISAO_PADRAO: Record<ResponsavelAdiantamento, number> = { vendedor: 40, captador: 10, imob: 50 }

export interface ParteComissao {
  resp: ResponsavelAdiantamento
  /** % da comissão total destinada a esta parte */
  pct: number
  total: number
  adiantado: number
  restante: number
}

export interface Comissao {
  total: number
  partes: ParteComissao[]
  adiantado: number
  restante: number
}

/** Arredonda para centavos: 5% de 100.000,01 não pode virar dízima na tela. */
const centavos = (n: number) => Math.round(n * 100) / 100

/**
 * Comissão de um processo: `pct`% do valor, dividida 40/10/50 (vendedor,
 * captador, imobiliária), menos os adiantamentos já pagos a cada parte.
 *
 * A última parte absorve a diferença de arredondamento para a soma das partes
 * fechar exatamente no total — senão R$ 0,01 some em vendas de valor "quebrado".
 */
export function calcularComissao(
  p: Pick<Processo, 'valor' | 'pct' | 'adiantamentos'>,
  divisao: Record<ResponsavelAdiantamento, number> = DIVISAO_PADRAO,
): Comissao {
  const total = centavos((p.valor * p.pct) / 100)
  const ordem: ResponsavelAdiantamento[] = ['vendedor', 'captador', 'imob']
  let acumulado = 0
  const partes = ordem.map((resp, i): ParteComissao => {
    const ultima = i === ordem.length - 1
    const valor = ultima ? centavos(total - acumulado) : centavos((total * divisao[resp]) / 100)
    acumulado = centavos(acumulado + valor)
    const adiantado = centavos(
      p.adiantamentos.filter((a) => a.resp === resp).reduce((t, a) => t + a.valor, 0),
    )
    return { resp, pct: divisao[resp], total: valor, adiantado, restante: centavos(valor - adiantado) }
  })
  const adiantado = centavos(partes.reduce((t, x) => t + x.adiantado, 0))
  return { total, partes, adiantado, restante: centavos(total - adiantado) }
}

export type ResultadoAdiantamento = { ok: true } | { ok: false; erro: string }

/** Valida um adiantamento novo contra o que ainda resta daquela parte. */
export function validarAdiantamento(
  p: Pick<Processo, 'valor' | 'pct' | 'adiantamentos'>,
  novo: Pick<Adiantamento, 'resp' | 'valor'>,
): ResultadoAdiantamento {
  if (!(novo.valor > 0)) return { ok: false, erro: 'Informe um valor maior que zero.' }
  const parte = calcularComissao(p).partes.find((x) => x.resp === novo.resp)
  if (!parte) return { ok: false, erro: 'Responsável inválido.' }
  if (novo.valor > parte.restante) {
    return { ok: false, erro: 'O adiantamento não pode passar do que resta dessa parte da comissão.' }
  }
  return { ok: true }
}

/** Soma das fontes de pagamento × valor da venda: «Faltam R$ …» ou «Fecha». */
export function conferirFontes(p: Pick<Processo, 'valor' | 'fin'>): { fecha: boolean; diferenca: number } {
  const soma = p.fin.financiado + p.fin.entrada + p.fin.fgts + p.fin.proprios + (p.fin.valorBem ?? 0)
  const diferenca = centavos(p.valor - soma)
  return { fecha: diferenca === 0, diferenca }
}
