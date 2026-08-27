import type { PropertyPurpose } from '~~/shared/models/property'

/**
 * Tetos de plausibilidade do cadastro de imóvel.
 *
 * ## Por que isto existe
 *
 * O preço é inteiro em reais — não centavos, não string. `parsePriceInput` já
 * garante que a máscara do campo não invente zeros. O que ficou de fora é o
 * erro humano puro: digitar `240000000` querendo `240000`. A validação do
 * servidor só exigia `price >= 0`, então esse valor entrava, e a vitrine da
 * imobiliária passou a anunciar um terreno de 240 m² por R$ 240.000.000.
 *
 * Um preço desses não é um detalhe de formatação: quem vê duvida do anúncio
 * inteiro, e depois da imobiliária.
 *
 * ## Por que rejeitar, e não "consertar"
 *
 * A saída óbvia seria dividir por mil na hora de exibir. É a pior de todas:
 * some com o erro de vista sem tirá-lo do banco, e uma mansão de nove dígitos
 * que seja legítima passa a ser exibida por um milésimo do valor. Corrigir dado
 * por adivinhação na camada de tela é como esconder o problema, não resolvê-lo.
 *
 * Aqui o cadastro recusa o valor e diz o que houve. Quem cadastrou é quem sabe
 * o preço certo — só falta ser avisado de que errou.
 *
 * ## Como os tetos foram escolhidos
 *
 * Generosos de propósito: o custo de recusar um imóvel legítimo é maior que o
 * de deixar passar um exagero. R$ 200 milhões é o dobro da maior venda
 * residencial já registrada no país; nenhum cadastro honesto de imobiliária de
 * bairro chega perto. Aluguel de R$ 1 milhão/mês só acontece quando alguém
 * digitou o valor de venda no campo errado — que é exatamente o que se quer
 * pegar. 1.000.000 m² são 100 hectares, o que acomoda rancho e chácara.
 *
 * Se um cliente aparecer com algo legítimo acima destes números, o ajuste é uma
 * linha aqui — e vale a conversa antes.
 */
export const PROPERTY_LIMITS = {
  precoVenda: 200_000_000,
  precoAluguel: 1_000_000,
  area: 1_000_000,
  /** Quartos, suítes, banheiros e vagas. Um prédio inteiro não passa disto. */
  comodos: 100,
} as const

export function maxPriceFor(purpose: PropertyPurpose): number {
  return purpose === 'aluguel' ? PROPERTY_LIMITS.precoAluguel : PROPERTY_LIMITS.precoVenda
}

/** Formata o teto para a mensagem de erro, sem centavos. */
function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

/**
 * Devolve a mensagem de erro quando o valor está fora do plausível, ou `null`.
 *
 * Vive em `shared/` porque o painel avisa enquanto a pessoa digita e o servidor
 * recusa no envio. Duas cópias da mesma régua divergiriam, e o campo passaria a
 * dizer que está tudo bem num valor que o servidor recusa.
 */
export function priceRangeError(price: number, purpose: PropertyPurpose): string | null {
  const max = maxPriceFor(purpose)
  if (price <= max) return null
  const pretensao = purpose === 'aluguel' ? 'aluguel' : 'venda'
  return `Preço de ${pretensao} acima de ${brl(max)} — confira se não sobrou um zero. Se o valor estiver certo mesmo, fale com o suporte.`
}

export function areaRangeError(area: number): string | null {
  if (area <= PROPERTY_LIMITS.area) return null
  return `Área acima de ${PROPERTY_LIMITS.area.toLocaleString('pt-BR')} m² — confira a medida.`
}

export function roomsRangeError(value: number, label: string): string | null {
  if (value <= PROPERTY_LIMITS.comodos) return null
  return `${label}: ${value} não parece certo. Confira se o número não foi digitado no campo errado.`
}
