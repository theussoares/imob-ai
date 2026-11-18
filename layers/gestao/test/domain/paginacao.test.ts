import { describe, expect, it } from 'vitest'
import { filtroArquivadosDaUrl, filtroDaUrl, lerPagina, paginar, POR_PAGINA, queryDaLista, queryDosArquivados, totalDePaginas } from '../../domain/paginacao'

describe('lerPagina', () => {
  it.each([
    ['3', 3],
    [['2', '5'], 2],
    [2, 2],
    ['0', 1],
    ['-3', 1],
    ['1.5', 1],
    ['abc', 1],
    ['9999999', 1],
    [undefined, 1],
    ['', 1],
  ])('%j → %i', (entrada, esperado) => {
    expect(lerPagina(entrada)).toBe(esperado)
  })
})

describe('paginar', () => {
  const lista = Array.from({ length: 50 }, (_, i) => i + 1)

  it('fatia no tamanho fixo e conta o total', () => {
    const p = paginar(lista, 2)
    expect(p.itens).toHaveLength(POR_PAGINA)
    expect(p.itens[0]).toBe(POR_PAGINA + 1)
    expect(p).toMatchObject({ total: 50, pagina: 2, paginas: 3 })
  })

  it('última página traz o resto', () => {
    expect(paginar(lista, 3).itens).toEqual([49, 50])
  })

  it('página além da última vem vazia, com o total certo', () => {
    expect(paginar(lista, 9)).toMatchObject({ itens: [], total: 50, paginas: 3 })
  })

  it('lista vazia tem uma página', () => {
    expect(paginar([], 1)).toMatchObject({ itens: [], total: 0, paginas: 1 })
    expect(totalDePaginas(0)).toBe(1)
  })
})

describe('filtro na URL', () => {
  const STATUS = ['Em negociação', 'Concluído']

  it('lê página, busca e status', () => {
    expect(filtroDaUrl({ pagina: '3', q: 'silva', status: 'Concluído' }, STATUS)).toEqual({ pagina: 3, q: 'silva', status: 'Concluído' })
  })

  it('URL editada à mão: status desconhecido vira «todos», página ruim vira 1, busca é cortada em 100', () => {
    expect(filtroDaUrl({ pagina: '-2', status: 'Inventado', q: 'x'.repeat(300) }, STATUS)).toEqual({ pagina: 1, q: 'x'.repeat(100), status: '' })
    expect(filtroDaUrl({}, STATUS)).toEqual({ pagina: 1, q: '', status: '' })
  })

  it('parâmetro repetido (?q=a&q=b) usa o primeiro', () => {
    expect(filtroDaUrl({ q: ['a', 'b'] }, STATUS).q).toBe('a')
  })

  it('escreve só o que não é padrão', () => {
    expect(queryDaLista({ pagina: 1, q: '', status: '' })).toEqual({})
    expect(queryDaLista({ pagina: 2, q: ' silva ', status: 'Concluído' })).toEqual({ pagina: '2', q: 'silva', status: 'Concluído' })
  })

  it('ida e volta: o que a tela escreve é o que ela lê', () => {
    const f = { pagina: 4, q: 'rua das flores', status: 'Em negociação' }
    expect(filtroDaUrl(queryDaLista(f), STATUS)).toEqual(f)
  })
})

describe('filtro de Arquivados na URL', () => {
  it('padrão é vendas, página 1; ida e volta', () => {
    expect(filtroArquivadosDaUrl({})).toEqual({ pagina: 1, q: '', tipo: 'venda' })
    expect(queryDosArquivados({ pagina: 1, q: '', tipo: 'venda' })).toEqual({})
    const f = { pagina: 2, q: 'silva', tipo: 'locacao' as const }
    expect(filtroArquivadosDaUrl(queryDosArquivados(f))).toEqual(f)
  })

  it('tipo desconhecido vira vendas', () => {
    expect(filtroArquivadosDaUrl({ tipo: 'x' }).tipo).toBe('venda')
  })
})
