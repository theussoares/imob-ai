import type { PropertyCard } from '../models/property'

/**
 * Imóveis parecidos para o fim da página de detalhe.
 *
 * A página terminava no formulário: quem não gostou do imóvel não tinha para
 * onde ir além do "voltar", e cada visita vinda do Google a um imóvel que não
 * serviu era uma visita perdida. A listagem de semelhantes é o que devolve essa
 * pessoa ao catálogo sem ela ter de refazer a busca.
 *
 * O critério é o que o comprador usa para trocar de opção: mesmo objetivo
 * (venda/aluguel é filtro, não peso — um aluguel não substitui uma compra),
 * depois bairro, tipo e faixa de preço. Pontuação simples em vez de algo
 * "inteligente": com catálogos de dezenas de imóveis, qualquer coisa mais
 * sofisticada só esconderia por que um card apareceu.
 */

/** Diferença de preço, em fração, que ainda conta como "mesma faixa". */
const FAIXA_DE_PRECO = 0.3

export function similarProperties(
  alvo: Pick<PropertyCard, 'code' | 'purpose' | 'type' | 'neighborhood' | 'price'>,
  catalogo: PropertyCard[],
  limite = 4,
): PropertyCard[] {
  const pontuados = catalogo
    .filter((c) => c.purpose === alvo.purpose && c.code !== alvo.code)
    .map((c) => {
      let pontos = 0
      if (alvo.neighborhood && c.neighborhood === alvo.neighborhood) pontos += 3
      if (c.type === alvo.type) pontos += 2
      const distancia = alvo.price > 0 ? Math.abs(c.price - alvo.price) / alvo.price : 1
      if (distancia <= FAIXA_DE_PRECO) pontos += 2
      return { c, pontos, distancia }
    })

  // Sem nenhum ponto em comum não é "semelhante", é enchimento: um terreno de
  // outro bairro abaixo de uma casa de alto padrão ensina a pessoa a ignorar a
  // seção. Melhor mostrar dois cards certos que quatro aleatórios.
  const relevantes = pontuados.filter((x) => x.pontos > 0)

  // Empate decide pelo preço mais próximo: entre dois apartamentos no mesmo
  // bairro, o que custa parecido é a troca mais provável.
  relevantes.sort((a, b) => b.pontos - a.pontos || a.distancia - b.distancia)
  return relevantes.slice(0, limite).map((x) => x.c)
}

/**
 * Semelhantes a partir do código do imóvel, para o servidor, que tem o
 * catálogo em cache mas não o imóvel inteiro.
 *
 * O código compara sem caixa porque a página de detalhe busca o imóvel com
 * `ilike` (`getPropertyByCodeWithBrokerPhone`): `/nc-0258` abre o NC-0258, e
 * os semelhantes precisam achar o mesmo imóvel pela mesma URL. Imóvel fora do
 * catálogo (rascunho aberto pelo painel, código que não existe) dá lista
 * vazia, e a página só não mostra a seção.
 */
export function similaresPorCodigo(codigo: string, catalogo: PropertyCard[], limite = 4): PropertyCard[] {
  const chave = codigo.trim().toLowerCase()
  const alvo = catalogo.find((c) => c.code.toLowerCase() === chave)
  return alvo ? similarProperties(alvo, catalogo, limite) : []
}
