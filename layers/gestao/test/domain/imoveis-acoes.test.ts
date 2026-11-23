import { describe, expect, it } from 'vitest'
import { locacoesSeed } from '../../domain/locacao-seed'
import { imoveisSeed } from '../../domain/imoveis'
import { matrizPadrao } from '../../domain/permissions'
import type { Sessao } from '../../domain/types'
import {
  atualizarImovel,
  criarImovel,
  definirDestaque,
  excluirImovel,
  formImovelVazio,
  imovelParaForm,
  mudarStatusImovel,
  permissoesImovel,
  podeExcluirImovel,
  validarImovel,
  type NovoImovel,
} from '../../domain/imoveis-acoes'

const AGORA = '2026-11-17T15:00:00.000Z'
const matriz = matrizPadrao()
const locs = locacoesSeed('2026-11-17')
const sessao = (perfil: Sessao['perfil'], corretorId: string | null = null): Sessao => ({ perfil, nome: 'Teste', corretorId })

const novo: NovoImovel = {
  ...formImovelVazio('c1'),
  title: 'Cobertura 2',
  type: 'apartamento',
  purpose: 'venda',
  price: 750000,
  neighborhood: 'Centro',
  city: 'Três Lagoas',
  state: 'MS',
  area: 120,
  bedrooms: 3,
  suites: 1,
  bathrooms: 2,
  parking: 2,
  ownerName: 'Ana Lima',
}

describe('validarImovel', () => {
  it('aceita todo o seed', () => {
    for (const i of imoveisSeed()) expect(validarImovel(imovelParaForm(i)).ok, i.id).toBe(true)
  })

  it.each<[Partial<NovoImovel>, string]>([
    [{ title: ' ' }, 'Informe o título do imóvel.'],
    [{ type: '' }, 'Escolha o tipo do imóvel.'],
    [{ purpose: '' }, 'Escolha a finalidade (venda ou aluguel).'],
    [{ price: 0 }, 'Informe um preço maior que zero.'],
    [{ price: null }, 'Informe um preço maior que zero.'],
    [{ price: -5 }, 'Informe um preço maior que zero.'],
    [{ neighborhood: '' }, 'Informe o bairro.'],
    [{ city: '' }, 'Informe a cidade.'],
    [{ state: 'M' }, 'Informe a UF com 2 letras.'],
    [{ addressZip: '7960000' }, 'O CEP precisa de 8 dígitos.'],
    [{ area: null }, 'Informe a área em m².'],
    [{ area: 0 }, 'Informe a área em m².'],
    [{ bedrooms: -1 }, 'Quartos precisa ser um número inteiro, de 0 a 50.'],
    [{ bedrooms: 2.5 }, 'Quartos precisa ser um número inteiro, de 0 a 50.'],
    [{ suites: 4 }, 'As suítes não podem passar do número de quartos.'],
    [{ ownerName: '' }, 'Informe o proprietário.'],
    [{ ownerPhone: '123456789' }, 'O telefone do proprietário precisa de DDD e 8 ou 9 dígitos.'],
    [{ brokerId: '' }, 'Escolha o corretor vendedor.'],
  ])('recusa %#', (parcial, erro) => {
    expect(validarImovel({ ...novo, ...parcial })).toEqual({ ok: false, erro })
  })

  it('aceita CEP e telefone vazios e normaliza (aparar, UF maiúscula, só dígitos no CEP)', () => {
    const r = validarImovel({ ...novo, title: '  Cobertura 2 ', state: 'ms', addressZip: '79.600-000', ownerPhone: '' })
    expect(r.ok && r.dados).toMatchObject({ title: 'Cobertura 2', state: 'MS', addressZip: '79600000', ownerPhone: null })
  })

  it('tipo sem quartos zera quartos, suítes, banheiros e vagas', () => {
    const r = validarImovel({ ...novo, type: 'terreno', bedrooms: 3, suites: 1, bathrooms: 2, parking: 2 })
    expect(r.ok && r.dados).toMatchObject({ bedrooms: 0, suites: 0, bathrooms: 0, parking: 0 })
  })
})

describe('criarImovel e atualizarImovel', () => {
  it('cria com id acima do maior, anúncio ativo por padrão e datas', () => {
    const r = criarImovel(imoveisSeed(), novo, AGORA)
    expect(r.ok && r.imovel).toMatchObject({ id: 'im-106', status: 'active', brokerId: 'c1', images: [], createdAt: AGORA, updatedAt: AGORA })
  })

  it('recusa duplicado (mesmo título e endereço, sem diferenciar acento nem caixa)', () => {
    const r = criarImovel(imoveisSeed(), { ...novo, title: 'KITNET', location: 'vila nova' }, AGORA)
    expect(r).toEqual({ ok: false, erro: 'Já existe um imóvel com este título e endereço.' })
  })

  it('atualiza preservando fotos e criação; manter o próprio título não é duplicado', () => {
    const base = imoveisSeed().map((i) => (i.id === 'im-102' ? { ...i, images: [{ id: 'f1', url: 'data:image/jpeg;base64,AA', urlSm: null, alt: null, position: 0, isCover: true }] } : i))
    const form = { ...imovelParaForm(base.find((i) => i.id === 'im-102')!), price: 530000 }
    const r = atualizarImovel(base, 'im-102', form, AGORA)
    expect(r.ok && r.imovel).toMatchObject({ id: 'im-102', price: 530000, createdAt: '2026-11-01T12:00:00.000Z', updatedAt: AGORA })
    expect(r.ok && r.imovel.images).toHaveLength(1)
  })

  it('recusa título de outro imóvel e id inexistente', () => {
    const base = imoveisSeed()
    const outro = base.find((i) => i.id === 'im-104')!
    const form = { ...imovelParaForm(base.find((i) => i.id === 'im-102')!), title: outro.title, location: outro.location ?? '' }
    expect(atualizarImovel(base, 'im-102', form, AGORA)).toEqual({ ok: false, erro: 'Já existe um imóvel com este título e endereço.' })
    expect(atualizarImovel(base, 'im-999', novo, AGORA)).toEqual({ ok: false, erro: 'Imóvel não encontrado.' })
  })

  it('muda status e destaque sem tocar no resto', () => {
    const base = imoveisSeed()
    const s = mudarStatusImovel(base, 'im-102', 'sold', AGORA)
    expect(s.ok && s.imovel).toMatchObject({ status: 'sold', title: base[1]!.title, updatedAt: AGORA })
    const d = definirDestaque(base, 'im-102', true, AGORA)
    expect(d.ok && d.imovel.featured).toBe(true)
    expect(mudarStatusImovel(base, 'im-999', 'draft', AGORA)).toEqual({ ok: false, erro: 'Imóvel não encontrado.' })
  })

  it('exclui o imóvel da lista; id inexistente é recusado', () => {
    const base = imoveisSeed()
    const r = excluirImovel(base, 'im-102')
    expect(r.ok && r.imoveis.map((i) => i.id)).toEqual(['im-101', 'im-103', 'im-104', 'im-105'])
    expect(excluirImovel(base, 'im-999')).toEqual({ ok: false, erro: 'Imóvel não encontrado.' })
  })
})

describe('permissões do imóvel', () => {
  const base = imoveisSeed()
  const im102 = base.find((i) => i.id === 'im-102')! // vendedor c2

  it('corretor vê, edita e exclui qualquer imóvel; não troca o corretor vendedor', () => {
    expect(permissoesImovel(matriz, sessao('corretor', 'c1'))).toMatchObject({ ver: true, editar: true, excluir: true, trocarCorretor: false })
  })

  it('recepção e jurídico veem, editam e trocam o corretor, mas não excluem', () => {
    for (const p of ['recepcao', 'juridico'] as const) {
      expect(permissoesImovel(matriz, sessao(p))).toMatchObject({ ver: true, editar: true, excluir: false, trocarCorretor: true })
    }
  })

  it('dono faz tudo; criar segue a matriz', () => {
    expect(permissoesImovel(matriz, sessao('dono'))).toMatchObject({ ver: true, editar: true, excluir: true, trocarCorretor: true })
    expect(permissoesImovel(matriz, sessao('corretor', 'c1')).criar).toBe(true)
    const sem = { ...matriz, criar: { ...matriz.criar, corretor: 'nao' as const } }
    expect(permissoesImovel(sem, sessao('corretor', 'c1')).criar).toBe(false)
  })

  it('excluir é recusado com locação em andamento e sem permissão', () => {
    const emLocacao = base.find((i) => i.id === locs.find((l) => l.status !== 'Encerrada' && !l.arquivado)!.imovelId)!
    expect(podeExcluirImovel(emLocacao, sessao('dono'), matriz, locs)).toEqual({
      ok: false,
      erro: 'Este imóvel tem locação em andamento. Encerre ou arquive a locação antes de excluir.',
    })
    expect(podeExcluirImovel(im102, sessao('recepcao'), matriz, [])).toEqual({ ok: false, erro: 'Você não pode excluir este imóvel.' })
    expect(podeExcluirImovel(im102, sessao('dono'), matriz, [])).toEqual({ ok: true })
  })
})

describe('errosImovel: todos os erros de uma vez, por campo', () => {
  it('formulário vazio acusa todos os obrigatórios, na ordem do formulário', async () => {
    const { errosImovel, formImovelVazio } = await import('../../domain/imoveis-acoes')
    expect(Object.keys(errosImovel(formImovelVazio()))).toEqual(['title', 'type', 'purpose', 'price', 'neighborhood', 'city', 'state', 'area', 'ownerName', 'brokerId'])
  })

  it('validarImovel devolve o primeiro dos mesmos erros', async () => {
    const { errosImovel, validarImovel, formImovelVazio } = await import('../../domain/imoveis-acoes')
    const f = formImovelVazio()
    const r = validarImovel(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toBe(Object.values(errosImovel(f))[0])
  })
})
