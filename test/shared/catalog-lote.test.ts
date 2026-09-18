import { describe, expect, test } from 'vitest'
import { CARDS_POR_LOTE, loteDoCatalogo } from '~~/shared/utils/catalog-lote'

/**
 * Quantos cards a home mostra antes do "Ver mais".
 *
 * O corte existe porque o catálogo inteiro chega num payload só — não há
 * paginação no servidor, e não pode haver: os filtros de venda/aluguel, tipo e
 * preço rodam em memória sobre essa lista, e é isso que os deixa instantâneos.
 * O que se corta aqui é RENDERIZAÇÃO, não requisição.
 *
 * ⚠️ O risco que estes testes guardam é o do botão que mente. Um "Ver mais 12"
 * quando faltam 3, ou um botão que aparece quando não há mais nada, custam a
 * confiança de quem está decidindo se vale continuar rolando — e nenhum dos
 * dois levanta erro em lugar nenhum.
 */

/** Lista de N posições; o conteúdo não importa, só a contagem e a ordem. */
function lista(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

describe('loteDoCatalogo', () => {
  test('lista menor que o lote aparece inteira, sem botão', () => {
    const r = loteDoCatalogo(lista(5), 1)
    expect(r.visiveis).toHaveLength(5)
    expect(r.restantes).toBe(0)
  })

  test('exatamente um lote não oferece "ver mais"', () => {
    // A borda que erra sozinha: `>=` em vez de `>` deixa um botão que revela
    // zero imóvel — a pessoa clica e a página não muda.
    const r = loteDoCatalogo(lista(CARDS_POR_LOTE), 1)
    expect(r.visiveis).toHaveLength(CARDS_POR_LOTE)
    expect(r.restantes).toBe(0)
  })

  test('lista maior mostra só o primeiro lote', () => {
    const r = loteDoCatalogo(lista(58), 1)
    expect(r.visiveis).toHaveLength(CARDS_POR_LOTE)
    expect(r.restantes).toBe(58 - CARDS_POR_LOTE)
  })

  test('o segundo lote acrescenta, não substitui', () => {
    // "Ver mais" revela; não troca de página. Quem já leu os 12 primeiros não
    // pode perdê-los de vista ao pedir mais.
    const r = loteDoCatalogo(lista(58), 2)
    expect(r.visiveis).toHaveLength(CARDS_POR_LOTE * 2)
    expect(r.visiveis[0]).toBe(0)
  })

  test('pedir mais lotes do que existe não estoura a lista', () => {
    const r = loteDoCatalogo(lista(20), 99)
    expect(r.visiveis).toHaveLength(20)
    expect(r.restantes).toBe(0)
  })

  test('o botão nunca promete mais do que sobrou', () => {
    // 58 imóveis, 4 lotes vistos (48): faltam 10, não 12. Prometer o lote cheio
    // no rótulo é a mentira mais fácil de escrever aqui.
    const r = loteDoCatalogo(lista(58), 4)
    expect(r.restantes).toBe(10)
    expect(r.proximoLote).toBe(10)
  })

  test('o próximo lote é o lote cheio quando sobra bastante', () => {
    expect(loteDoCatalogo(lista(58), 1).proximoLote).toBe(CARDS_POR_LOTE)
  })

  test('lista vazia não quebra a home', () => {
    // O estado vazio tem tela própria (com captura de lead). Esta função não
    // pode ser o que derruba a página antes de chegar lá.
    const r = loteDoCatalogo([], 1)
    expect(r.visiveis).toEqual([])
    expect(r.restantes).toBe(0)
    expect(r.proximoLote).toBe(0)
  })

  test('zero lotes ainda mostra o primeiro', () => {
    // Defesa contra o reset do filtro escrever 0 por engano: uma home sem card
    // nenhum, com imóveis no acervo, parece site quebrado.
    const r = loteDoCatalogo(lista(58), 0)
    expect(r.visiveis).toHaveLength(CARDS_POR_LOTE)
  })

  test('o lote cabe inteiro em 1, 2 e 3 colunas', () => {
    // O grid da home é 1 coluna no celular, 2 a partir de 820px e 3 a partir de
    // 1040px (ver `.grid` em main.css). Um lote que não divide por 3 deixa um
    // card sozinho na última linha, do lado do vazio — foi por isso que o corte
    // não ficou em 10.
    for (const colunas of [1, 2, 3]) expect(CARDS_POR_LOTE % colunas).toBe(0)
  })
})
