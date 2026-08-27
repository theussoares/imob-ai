import type { PropertyType } from '~~/shared/models/property'
import { temQuartos } from '~~/shared/models/property'

/**
 * A ficha de medidas do imóvel — fonte única para o card e para o detalhe.
 *
 * Existia duas vezes, escrita à mão nos dois lugares, e as duas divergiam: o
 * card decidia mostrar quartos por `bedrooms ?`, o detalhe por `temQuartos()`.
 * Uma casa com 0 quartos cadastrados (acontece: em produção há uma com
 * `bedrooms: 0` e `suites: 3`) aparecia como "Casa · 300 m²" no título e logo
 * abaixo exibia cama, banheiro e vaga. Aqui a regra é uma só.
 *
 * ## Por que cada número carrega um rótulo
 *
 * Os ícones renderizam — não é o caso de um SVG que falha. O problema é que
 * todos são `aria-hidden` e não havia texto nenhum ao lado: o conteúdo textual
 * do bloco era literalmente `2 1 2 3 375 m²`. Quem lê por leitor de tela ouve
 * "dois um dois três"; o Google indexa isso; e um assistente de IA pedindo
 * "casas de 2 quartos em Três Lagoas" não tem como saber que o 2 da frente é
 * quarto. O ícone informa quem enxerga, e só.
 *
 * O rótulo é abreviado ("qts", "banh") porque no card, a 320px, a forma extensa
 * quebra em quatro linhas e empurra os botões para fora do cartão. O detalhe,
 * que tem espaço, usa `long`.
 *
 * ## Zero não é medida
 *
 * Um imóvel sem vaga cadastrada não tem "0 vagas" — tem vaga não informada, e
 * as duas coisas não são a mesma. Pior no caso da área: "Terreno · 0 m²" é a
 * única informação que um terreno precisa dar, dada errada. Métrica ausente sai
 * da lista; quem consome decide o que dizer no lugar.
 */
export interface PropertySpec {
  /** Chave do AppIcon. */
  icon: string
  /** O número, já formatado em pt-BR. */
  value: string
  /** Rótulo curto, para o card. */
  short: string
  /** Rótulo por extenso, para a página de detalhe. */
  long: string
}

export interface PropertySpecFields {
  type: PropertyType
  bedrooms: number
  suites: number
  bathrooms: number
  parking: number
  area: number
}

/**
 * Área em pt-BR. O cadastro aceita decimal e em produção há `12.27` — exibir
 * com ponto lê como milhar em português ("doze mil e vinte e sete metros").
 */
export function formatArea(area: number): string {
  return area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos
}

export function propertySpecs(p: PropertySpecFields): PropertySpec[] {
  const specs: PropertySpec[] = []

  if (temQuartos(p.type)) {
    if (p.bedrooms > 0) {
      specs.push({
        icon: 'bed',
        value: String(p.bedrooms),
        short: plural(p.bedrooms, 'qto', 'qtos'),
        long: plural(p.bedrooms, 'quarto', 'quartos'),
      })
    }
    if (p.suites > 0) {
      specs.push({
        icon: 'suite',
        value: String(p.suites),
        short: plural(p.suites, 'suíte', 'suítes'),
        long: plural(p.suites, 'suíte', 'suítes'),
      })
    }
    if (p.bathrooms > 0) {
      specs.push({
        icon: 'bath',
        value: String(p.bathrooms),
        short: plural(p.bathrooms, 'banh', 'banhs'),
        long: plural(p.bathrooms, 'banheiro', 'banheiros'),
      })
    }
    if (p.parking > 0) {
      specs.push({
        icon: 'car',
        value: String(p.parking),
        short: plural(p.parking, 'vaga', 'vagas'),
        long: plural(p.parking, 'vaga', 'vagas'),
      })
    }
  }

  if (p.area > 0) {
    specs.push({ icon: 'area', value: formatArea(p.area), short: 'm²', long: 'm² de área' })
  }

  return specs
}

/**
 * Máscara de exibição do código de referência.
 *
 * O código vem de digitação manual e chega em cinco formas na MESMA
 * imobiliária: `A.D-0016`, `V.D0013`, `VD-009`, `V.D 005`, `V.D- 0010`,
 * `A.V 0011`. Lado a lado na grade, isso lê como cinco sistemas de numeração
 * diferentes — e o código é justamente o que a pessoa anota para falar com o
 * corretor.
 *
 * A normalização é conservadora de propósito: mantém as letras do prefixo (elas
 * distinguem `V.D` de `A.D` e de `LC`, e o significado é da imobiliária, não
 * nosso) e mantém os dígitos como estão (zerar à esquerda para um tamanho fixo
 * transformaria `009` e `0016` em coisas que a imobiliária não escreveu).
 * Só a pontuação e o espaçamento entre as duas partes é que viram um padrão:
 *
 *   A.D-0016 → AD-0016      V.D 005  → VD-005
 *   V.D0013  → VD-0013      V.D- 0010 → VD-0010
 *
 * Isto é máscara de tela e nada mais. A chave que resolve a URL, casa o lead e
 * vai no feed dos portais continua sendo `property.code` cru — reescrever a
 * chave primária por estética quebraria link já divulgado e o match no CRM.
 *
 * Código que não seja "letras + dígitos" passa intacto: não vale inventar
 * formato para o que não conhecemos.
 */
export function formatPropertyCode(code: string): string {
  const limpo = String(code ?? '')
    .trim()
    .toUpperCase()
  const m = limpo.match(/^([A-Z][A-Z.\s]*?)[\s.\-]*(\d+)$/)
  if (!m) return limpo.replace(/\s+/g, ' ')
  const prefixo = m[1]!.replace(/[.\s]/g, '')
  return `${prefixo}-${m[2]}`
}
