/**
 * Máscara de dinheiro dos campos do painel, no estilo «caixa registradora»: o
 * que se digita são centavos e a vírgula anda sozinha (1 → 0,01; 12345 → 123,45).
 *
 * Por que não `type="number"`: o campo nativo aceita «e», «-» e «1e5», some com o
 * separador de milhar (320000 vira um borrão de zeros fácil de errar por uma
 * casa), troca o valor com a rodinha do mouse e no pt-BR ainda confunde vírgula
 * com ponto conforme o navegador. Máscara de texto livre (aceitar «320.000,5»)
 * foi descartada porque obriga a adivinhar se o ponto é milhar ou decimal; só
 * dígitos não têm ambiguidade.
 */

/** 13 dígitos = R$ 99.999.999.999,99: acima disso o Number deixa de ser exato em centavos. */
export const MAX_DIGITOS_MOEDA = 13

/** Texto digitado/colado → valor em reais. Ignora tudo que não é dígito. */
export function valorDeTextoMoeda(texto: string): number {
  const digitos = texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITOS_MOEDA)
  return digitos ? Number(digitos) / 100 : 0
}

/** Reais → «320.000,00» (sem o «R$», que o campo mostra fixo ao lado). */
export function mascararMoeda(valor: number): string {
  const v = Number.isFinite(valor) && valor > 0 ? valor : 0
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Valor colado com vírgula decimal («1.500,5», «R$ 1500,50») ou com ponto
 * («1500.50»). Sem isso, colar «1500,5» viraria 150,05 pela regra dos centavos.
 * Só vale para cola: na digitação, tecla a tecla, a regra é sempre a dos centavos.
 */
export function valorDeColagemMoeda(texto: string): number {
  const limpo = texto.replace(/[^\d.,]/g, '')
  const m = /^(.*)[.,](\d{1,2})$/.exec(limpo)
  if (!m) return valorDeTextoMoeda(limpo + '00')
  const inteiro = m[1]!.replace(/\D/g, '')
  const centavos = m[2]!.padEnd(2, '0')
  return valorDeTextoMoeda(inteiro + centavos)
}
