import { describe, expect, it } from 'vitest'
import { imoveisSeed, type ImovelGestao } from '../../domain/imoveis'
import { formImovelVazio, type NovoImovel } from '../../domain/imoveis-acoes'
import { MockImoveisRepository } from '../../app/services/MockImoveisRepository'
import type { ArmazemImoveis } from '../../app/services/ImoveisRepository'

const novo: NovoImovel = {
  ...formImovelVazio('c1'), title: 'Cobertura 2', type: 'apartamento', purpose: 'venda', price: 750000,
  neighborhood: 'Centro', city: 'Três Lagoas', state: 'MS', area: 120, bedrooms: 3, suites: 1, bathrooms: 2, parking: 2, ownerName: 'Ana Lima',
}
const foto = { url: 'data:image/webp;base64,AAAA', urlSm: 'data:image/webp;base64,AA', alt: null }

function montar(cabe = () => true) {
  let lista: ImovelGestao[] = imoveisSeed()
  const armazem: ArmazemImoveis = { ler: () => lista, gravar: (l) => (cabe() ? ((lista = l), true) : false) }
  let n = 0
  const repo = new MockImoveisRepository(armazem, () => '2026-11-17T15:00:00.000Z', () => `f${++n}`)
  return { repo, atual: () => lista }
}

describe('MockImoveisRepository', () => {
  it('cria no topo da lista e atualiza preservando as fotos', async () => {
    const { repo, atual } = montar()
    const r = await repo.criar(novo)
    expect(r.ok && r.imovel.id).toBe('im-106')
    expect(atual()[0]!.id).toBe('im-106')
    await repo.adicionarFotos('im-106', [foto])
    const u = await repo.atualizar('im-106', { ...novo, price: 760000 })
    expect(u.ok && u.imovel.images).toHaveLength(1)
    expect((await repo.listar()).find((i) => i.id === 'im-106')!.price).toBe(760000)
  })

  it('aceita 6 fotos e recusa a 7ª', async () => {
    const { repo } = montar()
    for (let i = 0; i < 6; i++) expect((await repo.adicionarFotos('im-101', [foto])).ok).toBe(true)
    expect(await repo.adicionarFotos('im-101', [foto])).toEqual({ ok: false, erro: 'Cada imóvel aceita no máximo 6 fotos.' })
  })

  it('sem espaço no armazém: devolve a causa e o estado anterior fica intacto', async () => {
    let cabe = true
    const { repo, atual } = montar(() => cabe)
    const antes = atual()
    cabe = false
    const r = await repo.adicionarFotos('im-101', [foto])
    expect(r).toEqual({ ok: false, erro: 'Sem espaço para guardar neste navegador. Remova fotos ou imóveis de exemplo.' })
    expect(atual()).toBe(antes)
  })

  it('status, destaque e exclusão; id inexistente é recusado', async () => {
    const { repo, atual } = montar()
    const s = await repo.mudarStatus('im-102', 'draft')
    expect(s.ok && s.imovel.status).toBe('draft')
    const d = await repo.definirDestaque('im-102', true)
    expect(d.ok && d.imovel.featured).toBe(true)
    expect(await repo.excluir('im-102')).toEqual({ ok: true })
    expect(atual().some((i) => i.id === 'im-102')).toBe(false)
    expect(await repo.excluir('im-999')).toEqual({ ok: false, erro: 'Imóvel não encontrado.' })
    expect(await repo.adicionarFotos('im-999', [foto])).toEqual({ ok: false, erro: 'Imóvel não encontrado.' })
  })
})
