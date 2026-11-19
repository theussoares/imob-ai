import { describe, expect, it } from 'vitest'
import { imoveisSeed, type ImovelGestao } from '../../domain/imoveis'
import { formImovelVazio, type NovoImovel } from '../../domain/imoveis-acoes'
import { criarClienteGestao, type Fetcher } from '../../app/services/clienteGestao'
import { FOTOS_POR_REQUISICAO, HttpImoveisRepository } from '../../app/services/HttpImoveisRepository'
import type { ArmazemImoveis, ImoveisRepository } from '../../app/services/ImoveisRepository'
import { MockImoveisRepository } from '../../app/services/MockImoveisRepository'

/**
 * `ImoveisRepository`: o mesmo contrato roda contra o mock e contra o http (com um servidor falso que
 * usa o próprio mock por trás das rotas de `/api/gestao/imoveis`).
 */

const novo: NovoImovel = {
  ...formImovelVazio('c1'), title: 'Cobertura 2', type: 'apartamento', purpose: 'venda', price: 750000,
  neighborhood: 'Centro', city: 'Três Lagoas', state: 'MS', area: 120, bedrooms: 3, suites: 1, bathrooms: 2, parking: 2, ownerName: 'Ana Lima',
}
const foto = { url: 'data:image/webp;base64,AAAA', urlSm: 'data:image/webp;base64,AA', alt: null }

function mockSobreArmazem() {
  let lista: ImovelGestao[] = imoveisSeed()
  const armazem: ArmazemImoveis = { ler: () => lista, gravar: (l) => ((lista = l), true) }
  let n = 0
  return new MockImoveisRepository(armazem, () => '2026-11-17T15:00:00.000Z', () => `f${++n}`)
}

class Erro extends Error {
  readonly data: unknown
  constructor(readonly status: number, m: string) {
    super(m)
    this.data = { statusMessage: m }
  }
}

function http(): { repo: ImoveisRepository; corpos: unknown[] } {
  const base = mockSobreArmazem()
  const corpos: unknown[] = []
  const fetcher: Fetcher = async <T>(url: string, o: { method?: string; body?: unknown } = {}) => {
    const metodo = o.method ?? 'GET'
    const corpo = (o.body ?? {}) as Record<string, never>
    corpos.push(o.body)
    const rota = url.replace('/api/gestao/imoveis', '')
    const resp = async (p: Promise<{ ok: true; imovel: ImovelGestao } | { ok: false; erro: string }>) => {
      const r = await p
      if (!r.ok) throw new Erro(422, r.erro)
      return r.imovel as T
    }
    if (metodo === 'GET' && rota === '') return (await base.listar()) as T
    if (metodo === 'POST' && rota === '') return resp(base.criar(corpo as never))
    let m = /^\/([^/]+)$/.exec(rota)
    if (m && metodo === 'PUT') return resp(base.atualizar(m[1]!, corpo as never))
    if (m && metodo === 'DELETE') {
      const r = await base.excluir(m[1]!)
      if (!r.ok) throw new Erro(404, r.erro)
      return { ok: true } as T
    }
    m = /^\/([^/]+)\/(status|destaque|fotos)$/.exec(rota)
    if (m && m[2] === 'status') return resp(base.mudarStatus(m[1]!, corpo.status as never))
    if (m && m[2] === 'destaque') return resp(base.definirDestaque(m[1]!, corpo.featured as never))
    if (m && m[2] === 'fotos') return resp(base.adicionarFotos(m[1]!, corpo.fotos as never))
    m = /^\/([^/]+)\/fotos\/([^/]+)(?:\/(capa|mover))?$/.exec(rota)
    if (m && m[3] === 'capa') return resp(base.definirCapa(m[1]!, m[2]!))
    if (m && m[3] === 'mover') return resp(base.moverFoto(m[1]!, m[2]!, corpo.direcao as never))
    if (m && metodo === 'DELETE') return resp(base.removerFoto(m[1]!, m[2]!))
    throw new Erro(404, `Rota sem servidor falso: ${metodo} ${url}`)
  }
  return { repo: new HttpImoveisRepository(criarClienteGestao({ fetcher, token: () => 'tok' })), corpos }
}

describe.each([
  { nome: 'mock', criar: () => ({ repo: mockSobreArmazem() as ImoveisRepository }) },
  { nome: 'http', criar: () => ({ repo: http().repo }) },
])('ImoveisRepository — $nome', ({ criar }) => {
  it('cria, atualiza, muda status e destaque, exclui', async () => {
    const { repo } = criar()
    const c = await repo.criar(novo)
    expect(c.ok).toBe(true)
    const id = c.ok ? c.imovel.id : ''
    const u = await repo.atualizar(id, { ...novo, price: 760000 })
    expect(u.ok && u.imovel.price).toBe(760000)
    const s = await repo.mudarStatus(id, 'draft')
    expect(s.ok && s.imovel.status).toBe('draft')
    const d = await repo.definirDestaque(id, true)
    expect(d.ok && d.imovel.featured).toBe(true)
    expect(await repo.excluir(id)).toEqual({ ok: true })
    expect((await repo.listar()).some((i) => i.id === id)).toBe(false)
  })

  it('fotos: adiciona, capa, mover e remover', async () => {
    const { repo } = criar()
    const a = await repo.adicionarFotos('im-101', [foto, foto])
    expect(a.ok && a.imovel.images.length).toBeGreaterThanOrEqual(2)
    const imagens = a.ok ? a.imovel.images : []
    const alvo = imagens.at(-1)!
    const capa = await repo.definirCapa('im-101', alvo.id)
    expect(capa.ok && capa.imovel.images.find((f) => f.id === alvo.id)?.isCover).toBe(true)
    expect((await repo.moverFoto('im-101', alvo.id, 'cima')).ok).toBe(true)
    const r = await repo.removerFoto('im-101', alvo.id)
    expect(r.ok && r.imovel.images.some((f) => f.id === alvo.id)).toBe(false)
  })

  it('imóvel inexistente: recusa com a causa, sem lançar', async () => {
    const { repo } = criar()
    expect(await repo.adicionarFotos('im-999', [foto])).toMatchObject({ ok: false })
    expect(await repo.excluir('im-999')).toMatchObject({ ok: false })
  })
})

describe('HttpImoveisRepository', () => {
  it(`envia as fotos em lotes de ${FOTOS_POR_REQUISICAO} (cabe nos 4,5 MB da função)`, async () => {
    const { repo, corpos } = http()
    // O mock por trás limita a 6; 2 lotes (4 + 2) bastam para ver o corte.
    await repo.adicionarFotos('im-102', [foto, foto, foto, foto, foto, foto])
    const lotes = corpos.filter((c) => (c as { fotos?: unknown[] } | undefined)?.fotos).map((c) => (c as { fotos: unknown[] }).fotos.length)
    expect(lotes).toEqual([4, 2])
  })
})
