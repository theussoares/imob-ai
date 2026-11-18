import { describe, expect, it } from 'vitest'
import { IMOVEIS_EXEMPLO, locacoesSeed } from '../../domain/locacao-seed'
import { filtrarImoveis, FILTRO_IMOVEIS_VAZIO, imoveisSeed, rotuloImovel, situacaoImovel } from '../../domain/imoveis'

const HOJE = '2026-11-17'
const locs = locacoesSeed(HOJE)

describe('imoveisSeed', () => {
  it('mantém ids e rótulos de IMOVEIS_EXEMPLO, para as locações do seed continuarem batendo', () => {
    const seed = imoveisSeed()
    expect(seed.map((i) => i.id)).toEqual(IMOVEIS_EXEMPLO.map((i) => i.id))
    expect(seed.map(rotuloImovel)).toEqual(IMOVEIS_EXEMPLO.map((i) => i.rotulo))
  })

  it('traz o modelo do catálogo: finalidade única, corretor vendedor e anúncio ativo', () => {
    const seed = imoveisSeed()
    expect(seed.every((i) => i.purpose === 'venda' || i.purpose === 'aluguel')).toBe(true)
    expect(seed.every((i) => ['c1', 'c2', 'c3'].includes(i.brokerId))).toBe(true)
    expect(seed.every((i) => i.price > 0 && i.city === 'Três Lagoas' && i.state === 'MS' && i.status === 'active')).toBe(true)
    expect(seed.every((i) => i.images.length === 0)).toBe(true)
  })

  it('«Venda e locação» antigos viram aluguel (as telas de locação listam só aluguel)', () => {
    const porId = Object.fromEntries(imoveisSeed().map((i) => [i.id, i.purpose]))
    expect(porId['im-101']).toBe('aluguel')
    expect(porId['im-105']).toBe('aluguel')
    expect(porId['im-102']).toBe('venda')
  })
})

describe('situacaoImovel', () => {
  it('está em locação quando há locação aberta, e disponível quando não há', () => {
    const emUso = locs.find((l) => l.status !== 'Encerrada' && !l.arquivado)!
    expect(situacaoImovel(emUso.imovelId, locs)).toBe('em-locacao')
    expect(situacaoImovel('im-999', locs)).toBe('disponivel')
  })

  it('locação encerrada ou arquivada libera o imóvel', () => {
    const l = locs.find((x) => x.status !== 'Encerrada' && !x.arquivado)!
    const so = locs.filter((x) => x.imovelId === l.imovelId)
    expect(situacaoImovel(l.imovelId, so.map((x) => ({ ...x, arquivado: true })))).toBe('disponivel')
    expect(situacaoImovel(l.imovelId, so.map((x) => ({ ...x, status: 'Encerrada' as const })))).toBe('disponivel')
  })
})

describe('filtrarImoveis', () => {
  const imoveis = imoveisSeed()
  it('busca sem acento e sem diferenciar maiúsculas, também pelo proprietário', () => {
    expect(filtrarImoveis(imoveis, locs, { ...FILTRO_IMOVEIS_VAZIO, busca: 'BARRACAO' }).map((i) => i.id)).toEqual(['im-105'])
    expect(filtrarImoveis(imoveis, locs, { ...FILTRO_IMOVEIS_VAZIO, busca: 'otavio' }).map((i) => i.id)).toEqual(['im-102'])
  })

  it('filtra por finalidade, status do anúncio e situação', () => {
    const soVenda = filtrarImoveis(imoveis, locs, { ...FILTRO_IMOVEIS_VAZIO, purpose: 'venda' })
    expect(soVenda.map((i) => i.id)).toEqual(['im-102'])
    const rascunho = imoveis.map((i) => (i.id === 'im-103' ? { ...i, status: 'draft' as const } : i))
    expect(filtrarImoveis(rascunho, locs, { ...FILTRO_IMOVEIS_VAZIO, status: 'draft' }).map((i) => i.id)).toEqual(['im-103'])
    const livres = filtrarImoveis(imoveis, [], { ...FILTRO_IMOVEIS_VAZIO, situacao: 'disponivel' })
    expect(livres).toHaveLength(imoveis.length)
  })
})

describe('situação derivada pelos contratos (locação e venda)', () => {
  const loc = (status: string, arquivado = false) => [{ imovelId: 'i1', status, arquivado }] as never
  const venda = (status: string, arquivado = false, imovelId = 'i1') => [{ imovelId, status, arquivado }] as never

  it('locação ativa → em locação; encerrada ou arquivada → volta a disponível (sem estado gravado)', async () => {
    const { situacaoImovel } = await import('../../domain/imoveis')
    expect(situacaoImovel('i1', loc('Ativa'))).toBe('em-locacao')
    expect(situacaoImovel('i1', loc('Ativa', true))).toBe('disponivel')
    expect(situacaoImovel('i1', loc('Encerrada'))).toBe('disponivel')
  })

  it('venda em andamento → em venda; concluída → vendido; cancelada/arquivada/sem vínculo → disponível', async () => {
    const { situacaoImovel } = await import('../../domain/imoveis')
    expect(situacaoImovel('i1', [], venda('Em negociação'))).toBe('em-venda')
    expect(situacaoImovel('i1', [], venda('Venda concluída'))).toBe('vendido')
    expect(situacaoImovel('i1', [], venda('Venda cancelada'))).toBe('disponivel')
    expect(situacaoImovel('i1', [], venda('Em negociação', true))).toBe('disponivel')
    expect(situacaoImovel('i1', [], venda('Em negociação', false, 'outro'))).toBe('disponivel')
    expect(situacaoImovel('i1', loc('Ativa'), venda('Em negociação'))).toBe('em-locacao')
  })
})
