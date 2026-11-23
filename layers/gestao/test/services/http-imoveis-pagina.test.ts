import { describe, expect, it } from 'vitest'
import { FILTRO_LISTA_IMOVEIS_VAZIO } from '../../domain/imoveis-lista'
import { criarClienteGestao, type Fetcher } from '../../app/services/clienteGestao'
import { HttpImoveisRepository } from '../../app/services/HttpImoveisRepository'

/** A ponte do front com `GET /api/gestao/imoveis`: o filtro INTEIRO vai na query, e `pagina` sempre vai (é ela que escolhe a resposta paginada). */

function repo(resposta: (url: string, query?: Record<string, unknown>) => unknown) {
  const pedidos: { url: string; query?: Record<string, unknown> }[] = []
  const fetcher: Fetcher = async <T>(url: string, o: { query?: Record<string, unknown> } = {}) => {
    pedidos.push({ url, query: o.query })
    return resposta(url, o.query) as T
  }
  return { repo: new HttpImoveisRepository(criarClienteGestao({ fetcher, token: () => 't' })), pedidos }
}

describe('HttpImoveisRepository.pagina', () => {
  it('lista sem filtro: só `pagina=1` na query', async () => {
    const { repo: r, pedidos } = repo(() => ({ itens: [], total: 0, pagina: 1, porPagina: 24, paginas: 1, truncado: false }))
    await r.pagina(FILTRO_LISTA_IMOVEIS_VAZIO)
    expect(pedidos).toEqual([{ url: '/api/gestao/imoveis', query: { pagina: '1' } }])
  })

  it('página, busca e os três filtros vão juntos', async () => {
    const { repo: r, pedidos } = repo(() => ({ itens: [], total: 0, pagina: 2, porPagina: 24, paginas: 1, truncado: false }))
    await r.pagina({ pagina: 2, q: ' centro ', status: 'active', purpose: 'aluguel', situacao: 'disponivel' })
    expect(pedidos[0]!.query).toEqual({ pagina: '2', q: 'centro', status: 'active', purpose: 'aluguel', situacao: 'disponivel' })
  })
})

describe('HttpImoveisRepository.obter', () => {
  it('devolve o imóvel pelo id', async () => {
    const { repo: r, pedidos } = repo(() => ({ id: 'abc', title: 'Casa' }))
    expect(await r.obter('abc')).toMatchObject({ id: 'abc' })
    expect(pedidos[0]!.url).toBe('/api/gestao/imoveis/abc')
  })

  it('404 vira null (imóvel que não existe neste tenant); outro erro sobe', async () => {
    const naoAcha = repo(() => { throw Object.assign(new Error('nope'), { status: 404 }) })
    expect(await naoAcha.repo.obter('x')).toBeNull()
    const cai = repo(() => { throw Object.assign(new Error('boom'), { status: 500 }) })
    await expect(cai.repo.obter('x')).rejects.toBeTruthy()
  })
})
