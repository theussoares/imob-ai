import { describe, expect, it } from 'vitest'
import { imoveisSeed, situacaoImovel, situacaoPorContratos } from '../../domain/imoveis'
import { FILTRO_LISTA_IMOVEIS_VAZIO, filtroImoveisDaUrl, filtroPedeVarredura, paginaDeImoveis, queryDaListaImoveis } from '../../domain/imoveis-lista'
import { POR_PAGINA } from '../../domain/paginacao'

const base = imoveisSeed()
const disponivel = () => 'disponivel' as const
const muitos = (n: number) => Array.from({ length: n }, (_, i) => ({ ...base[0]!, id: `im-x${i}`, title: `Casa ${i}` }))

describe('situacaoPorContratos', () => {
  it('locação ativa vence venda; venda em andamento; concluída; sem contrato', () => {
    expect(situacaoPorContratos(true, ['Venda concluída'])).toBe('em-locacao')
    expect(situacaoPorContratos(false, ['Venda cancelada', 'Proposta aceita'])).toBe('em-venda')
    expect(situacaoPorContratos(false, ['Venda concluída'])).toBe('vendido')
    expect(situacaoPorContratos(false, ['Venda cancelada'])).toBe('disponivel')
    expect(situacaoPorContratos(false, [])).toBe('disponivel')
  })

  it('situacaoImovel dá o mesmo resultado com contratos inteiros', () => {
    expect(situacaoImovel('im-101', [], [])).toBe('disponivel')
  })
})

describe('URL ⇄ filtro da lista de imóveis', () => {
  it('lixo na URL vira «todos» e página 1; q é cortada em 100', () => {
    expect(filtroImoveisDaUrl({ pagina: '0', status: 'xx', purpose: 'troca', situacao: 'quase', q: 'a'.repeat(300) })).toEqual({
      pagina: 1, status: '', purpose: '', situacao: '', q: 'a'.repeat(100),
    })
  })

  it('ida e volta, sem o que é padrão', () => {
    const f = { pagina: 3, q: 'centro', status: 'active', purpose: 'venda', situacao: 'disponivel' } as const
    expect(filtroImoveisDaUrl(queryDaListaImoveis(f))).toEqual(f)
    expect(queryDaListaImoveis(FILTRO_LISTA_IMOVEIS_VAZIO)).toEqual({})
  })

  it('só texto ou situação pedem a varredura do tenant', () => {
    expect(filtroPedeVarredura(FILTRO_LISTA_IMOVEIS_VAZIO)).toBe(false)
    expect(filtroPedeVarredura({ q: '  ', situacao: '' })).toBe(false)
    expect(filtroPedeVarredura({ q: 'casa', situacao: '' })).toBe(true)
    expect(filtroPedeVarredura({ q: '', situacao: 'vendido' })).toBe(true)
  })
})

describe('paginaDeImoveis', () => {
  it('fatia em POR_PAGINA, com total e páginas do filtro inteiro', () => {
    const lista = muitos(POR_PAGINA * 2 + 5)
    const p1 = paginaDeImoveis(lista, disponivel, FILTRO_LISTA_IMOVEIS_VAZIO)
    expect(p1.itens).toHaveLength(POR_PAGINA)
    expect(p1).toMatchObject({ total: POR_PAGINA * 2 + 5, paginas: 3, pagina: 1, porPagina: POR_PAGINA })
    expect(paginaDeImoveis(lista, disponivel, { ...FILTRO_LISTA_IMOVEIS_VAZIO, pagina: 3 }).itens).toHaveLength(5)
  })

  it('cada item leva a situação; o filtro por situação vale para a lista toda, não só a página', () => {
    const lista = muitos(40)
    const situacaoDe = (id: string) => (id === 'im-x35' ? 'vendido' : 'disponivel')
    const p = paginaDeImoveis(lista, situacaoDe, { ...FILTRO_LISTA_IMOVEIS_VAZIO, situacao: 'vendido' })
    expect(p.itens.map((i) => [i.id, i.situacao])).toEqual([['im-x35', 'vendido']])
    expect(p.total).toBe(1)
  })

  it('busca ignora acento e caixa, e acha pelo código', () => {
    const lista = [{ ...base[0]!, id: 'a', title: 'Chácara São José', code: 'IM-0042' }, { ...base[0]!, id: 'b', title: 'Casa', code: 'IM-0001' }]
    expect(paginaDeImoveis(lista, disponivel, { ...FILTRO_LISTA_IMOVEIS_VAZIO, q: 'sao jose' }).itens.map((i) => i.id)).toEqual(['a'])
    expect(paginaDeImoveis(lista, disponivel, { ...FILTRO_LISTA_IMOVEIS_VAZIO, q: 'im-0042' }).itens.map((i) => i.id)).toEqual(['a'])
  })

  it('anúncio e finalidade filtram junto; página além da última vem vazia (a tela vai para a última)', () => {
    const lista = muitos(3).map((i, n) => ({ ...i, status: n === 0 ? ('draft' as const) : ('active' as const), purpose: 'venda' as const }))
    expect(paginaDeImoveis(lista, disponivel, { ...FILTRO_LISTA_IMOVEIS_VAZIO, status: 'draft', purpose: 'venda' }).total).toBe(1)
    expect(paginaDeImoveis(lista, disponivel, { ...FILTRO_LISTA_IMOVEIS_VAZIO, pagina: 9 }).itens).toEqual([])
  })
})
