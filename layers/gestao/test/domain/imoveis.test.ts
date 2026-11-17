import { describe, expect, it } from 'vitest'
import { IMOVEIS_EXEMPLO, locacoesSeed } from '../../domain/locacao-seed'
import { cadastrarImovel, filtrarImoveis, FILTRO_IMOVEIS_VAZIO, imoveisSeed, proximoIdImovel, rotuloImovel, situacaoImovel } from '../../domain/imoveis'

const HOJE = '2026-11-17'
const locs = locacoesSeed(HOJE)
const novo = { titulo: 'Cobertura 2', endereco: 'Av. Brasil, 10', tipo: 'Apartamento' as const, finalidade: 'Venda' as const, proprietario: 'Ana Lima', captadorId: 'c1' }

describe('imoveisSeed', () => {
  it('mantém ids e rótulos de IMOVEIS_EXEMPLO, para as locações do seed continuarem batendo', () => {
    const seed = imoveisSeed()
    expect(seed.map((i) => i.id)).toEqual(IMOVEIS_EXEMPLO.map((i) => i.id))
    expect(seed.map(rotuloImovel)).toEqual(IMOVEIS_EXEMPLO.map((i) => i.rotulo))
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
  it('filtra por finalidade e por situação', () => {
    const soLocacao = filtrarImoveis(imoveis, locs, { ...FILTRO_IMOVEIS_VAZIO, finalidade: 'Locação' })
    expect(soLocacao.every((i) => i.finalidade === 'Locação')).toBe(true)
    const livres = filtrarImoveis(imoveis, [], { ...FILTRO_IMOVEIS_VAZIO, situacao: 'disponivel' })
    expect(livres).toHaveLength(imoveis.length)
  })
})

describe('cadastrarImovel', () => {
  it('cadastra com id acima do maior e apara espaços', () => {
    const r = cadastrarImovel(imoveisSeed(), { ...novo, titulo: '  Cobertura 2 ' })
    expect(r.ok && r.imovel).toMatchObject({ id: 'im-106', titulo: 'Cobertura 2', proprietario: 'Ana Lima' })
  })

  it.each([
    [{ titulo: ' ' }, 'Informe o título do imóvel.'],
    [{ tipo: '' as const }, 'Escolha o tipo do imóvel.'],
    [{ finalidade: '' as const }, 'Escolha a finalidade (venda, locação ou ambas).'],
    [{ proprietario: '' }, 'Informe o proprietário.'],
    [{ captadorId: '' }, 'Escolha o corretor captador.'],
  ])('recusa %#', (parcial, erro) => {
    expect(cadastrarImovel(imoveisSeed(), { ...novo, ...parcial })).toEqual({ ok: false, erro })
  })

  it('recusa duplicado (mesmo título e endereço, sem diferenciar acento)', () => {
    const lista = imoveisSeed()
    const dup = cadastrarImovel(lista, { ...novo, titulo: 'KITNET', endereco: 'vila nova' })
    expect(dup).toEqual({ ok: false, erro: 'Já existe um imóvel com este título e endereço.' })
  })

  it('proximoIdImovel nunca reutiliza id', () => {
    expect(proximoIdImovel([])).toBe('im-101')
  })
})
