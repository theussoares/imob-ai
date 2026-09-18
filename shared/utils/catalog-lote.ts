/**
 * Quantos cards a home mostra por vez.
 *
 * 12, e não 10, por duas razões independentes. A primeira é de leitura: o grid
 * é 1 / 2 / 3 colunas (ver `.grid` em `main.css`), e 12 fecha linha nos três —
 * 10 deixa um card órfão sozinho na última linha do desktop.
 *
 * A segunda é de conversão. A pesquisa de usabilidade de lista de produto é
 * consistente em que carregar POUCO faz a pessoa subestimar o acervo e sair de
 * um site que tinha o que ela queria. Aqui isso é atenuado porque a contagem
 * ("58 imóveis encontrados") fica logo acima da grade, mas o risco é real: na
 * maior imobiliária de hoje, 10 de 58 são 17% do que existe.
 */
export const CARDS_POR_LOTE = 12

export interface LoteDoCatalogo<T> {
  /** Os cards a renderizar agora. */
  visiveis: T[]
  /** Quantos ficaram de fora. Zero significa que não há botão a mostrar. */
  restantes: number
  /** Quantos o próximo clique revela — para o rótulo do botão não mentir. */
  proximoLote: number
}

/**
 * Corta a lista já filtrada no lote visível.
 *
 * Só corta RENDERIZAÇÃO. O catálogo inteiro já chegou no payload do SSR, num
 * request só, e é sobre ele que os filtros de venda/aluguel, tipo e preço
 * rodam em memória — paginar no servidor devolveria uma requisição a cada
 * filtro e mataria justamente o que torna a busca instantânea.
 *
 * Por isso o ganho aqui é DOM e cansaço de rolagem, não banda: as fotos já
 * carregam sob demanda a partir do quarto card. O efeito colateral que mais
 * vale é outro — o formulário de captura do rodapé do catálogo deixa de ficar
 * atrás de 58 imóveis.
 *
 * ⚠️ Fica FORA do componente de propósito. Este repositório não tem teste de
 * componente (decisão registrada no `vitest.config.ts`), e um botão que promete
 * "mais 12" quando faltam 3 não levanta erro em lugar nenhum.
 */
export function loteDoCatalogo<T>(lista: T[], lotes: number): LoteDoCatalogo<T> {
  // `lotes` nunca abaixo de 1: uma home sem card nenhum, com imóveis no
  // acervo, parece site quebrado — e quem escreve esse zero é o reset do
  // filtro, do outro lado do arquivo.
  const ate = Math.max(1, Math.floor(lotes)) * CARDS_POR_LOTE
  const visiveis = lista.slice(0, ate)
  const restantes = lista.length - visiveis.length

  return { visiveis, restantes, proximoLote: Math.min(restantes, CARDS_POR_LOTE) }
}
