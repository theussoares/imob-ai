import { describe, expect, test } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { FILTRO_LISTA_IMOVEIS_VAZIO } from '~~/layers/gestao/domain/imoveis-lista'
import type { Perfil } from '~~/layers/gestao/domain/types'
import { listarImoveisPagina, type ContextoImoveis } from '~~/server/utils/gestao-imoveis'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Lista paginada de imóveis. O que este arquivo impede:
 *
 * - página montada sem `tenant_id` (a service_role ignora RLS: o filtro é a única barreira entre imobiliárias);
 * - a lista voltar a ser fatiada no cliente (offset/limite têm de ir na query) ou lida inteira sem necessidade;
 * - a situação do imóvel sair dos contratos do CORRETOR em vez dos do tenant, mostrando «disponível» um imóvel
 *   que está em locação de outro corretor.
 */

const TENANT = 't1'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function row(n: number, over: Record<string, unknown> = {}) {
  return {
    id: id(n), tenant_id: TENANT, code: `IM-${String(n).padStart(4, '0')}`, title: `Casa ${n}`, type: 'casa', purpose: 'venda', price: 350000,
    neighborhood: 'Centro', city: 'Três Lagoas', state: 'MS', bedrooms: 3, suites: 1, bathrooms: 2, parking: 2, area: 180, high_standard: false,
    description: null, features: [], status: 'active', featured: false, created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z',
    location: null, address_zip: null, address_street: null, address_number: null, broker_id: 'b1', owner_name: 'Helena', owner_phone: null,
    updated_by: 'u-secreto', property_images: [], ...over,
  }
}
const corretor = { id: 'b1', tenant_id: TENANT, name: 'Carlos', active: true, phone: '67999990000', email: 'c@x.com' }
type Res = Parameters<typeof fakeSupabase>[0]

function montar(perfil: Perfil, results: Res) {
  const { client, calls } = fakeSupabase({ brokers: { data: [corretor], error: null }, gestao_locacoes: { data: [], error: null }, gestao_vendas: { data: [], error: null }, ...results })
  const ctx: ContextoImoveis = {
    membro: { userId: 'u1', nome: 'Fulano', perfil, brokerId: perfil === 'corretor' ? 'b1' : null },
    tenant: { id: TENANT, slug: 'acme' },
    matriz: matrizPadrao(),
    db: client,
    registrar: async () => {},
    invalidarCache: async () => {},
    armazenarFoto: async () => ({ url: 'u', urlSm: null }),
    locacoesDoImovel: async () => [],
  }
  return { ctx, calls }
}
const doBanco = (calls: ReturnType<typeof montar>['calls'], tabela: string) => calls.filter((c) => c.table === tabela)

describe('listarImoveisPagina: sem texto nem situação, o banco fatia', () => {
  test('uma página por consulta: tenant, ordem, range 0–23 e contagem exata', async () => {
    const { ctx, calls } = montar('corretor', { properties: { data: [row(1), row(2)], error: null, count: 30 } })
    const r = await listarImoveisPagina(ctx, FILTRO_LISTA_IMOVEIS_VAZIO)
    expect(r).toMatchObject({ total: 30, pagina: 1, porPagina: 24, paginas: 2, truncado: false })
    expect(r.itens.map((i) => i.id)).toEqual([id(1), id(2)])
    const props = doBanco(calls, 'properties')
    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    expect(props.find((c) => c.method === 'select')?.args[1]).toEqual({ count: 'exact' })
    expect(props.find((c) => c.method === 'range')?.args).toEqual([0, 23])
    expect(props.some((c) => c.method === 'limit')).toBe(false)
  })

  test('página 3 pede o range 48–71; status e finalidade vão ao banco', async () => {
    const { ctx, calls } = montar('dono', { properties: { data: [], error: null, count: 60 } })
    await listarImoveisPagina(ctx, { ...FILTRO_LISTA_IMOVEIS_VAZIO, pagina: 3, status: 'draft', purpose: 'aluguel' })
    const props = doBanco(calls, 'properties')
    expect(props.find((c) => c.method === 'range')?.args).toEqual([48, 71])
    expect(props.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual(expect.arrayContaining([['tenant_id', TENANT], ['status', 'draft'], ['purpose', 'aluguel']]))
  })

  test('qualquer perfil, inclusive corretor, vê imóveis de outro corretor: sem filtro de broker_id', async () => {
    const { ctx, calls } = montar('corretor', { properties: { data: [row(1, { broker_id: 'b2' })], error: null, count: 1 } })
    expect((await listarImoveisPagina(ctx, FILTRO_LISTA_IMOVEIS_VAZIO)).itens).toHaveLength(1)
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'broker_id')).toBe(false)
  })

  test('o payload não carrega coluna interna do banco', async () => {
    const { ctx } = montar('dono', { properties: { data: [row(1)], error: null, count: 1 } })
    const [i] = (await listarImoveisPagina(ctx, FILTRO_LISTA_IMOVEIS_VAZIO)).itens
    expect(JSON.stringify(i)).not.toContain('u-secreto')
    for (const k of ['updatedBy', 'tenantId']) expect(i).not.toHaveProperty(k)
  })
})

describe('listarImoveisPagina: texto ou situação leem o tenant e filtram em memória', () => {
  test('busca sem acento, até 1000 imóveis, paginada depois do filtro', async () => {
    const { ctx, calls } = montar('corretor', { properties: { data: [row(1, { title: 'Chácara São José' }), row(2)], error: null } })
    const r = await listarImoveisPagina(ctx, { ...FILTRO_LISTA_IMOVEIS_VAZIO, q: 'sao jose' })
    expect(r.itens.map((i) => i.id)).toEqual([id(1)])
    expect(r.total).toBe(1)
    expect(calls.find((c) => c.table === 'properties' && c.method === 'limit')?.args[0]).toBe(1000)
    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
  })

  test('chegou ao teto de 1000: truncado avisa a tela', async () => {
    const mil = Array.from({ length: 1000 }, (_, n) => row(n + 1))
    const { ctx } = montar('dono', { properties: { data: mil, error: null } })
    expect((await listarImoveisPagina(ctx, { ...FILTRO_LISTA_IMOVEIS_VAZIO, q: 'casa' })).truncado).toBe(true)
  })
})

describe('situação vem dos contratos do TENANT', () => {
  const contratos = {
    gestao_locacoes: { data: [{ imovel_id: id(1) }], error: null },
    gestao_vendas: {
      data: [
        { status: 'Proposta aprovada', imovel_id: id(2) },
        { status: 'Venda concluída', imovel_id: id(3) },
        { status: 'Venda cancelada', imovel_id: id(4) },
        { status: 'Venda concluída', imovel_id: null },
      ],
      error: null,
    },
  }

  test('locação de qualquer corretor, venda em andamento, vendido e cancelada → disponível', async () => {
    const { ctx } = montar('corretor', { properties: { data: [row(1), row(2), row(3), row(4), row(5)], error: null, count: 5 }, ...contratos })
    const r = await listarImoveisPagina(ctx, FILTRO_LISTA_IMOVEIS_VAZIO)
    expect(r.itens.map((i) => i.situacao)).toEqual(['em-locacao', 'em-venda', 'vendido', 'disponivel', 'disponivel'])
  })

  test('as duas leituras de contrato levam tenant e só linhas ativas, e nunca o escopo do corretor', async () => {
    const { ctx, calls } = montar('corretor', { properties: { data: [row(1)], error: null, count: 1 }, ...contratos })
    await listarImoveisPagina(ctx, FILTRO_LISTA_IMOVEIS_VAZIO)
    for (const t of ['gestao_locacoes', 'gestao_vendas']) {
      const eqs = doBanco(calls, t).filter((c) => c.method === 'eq').map((c) => c.args)
      expect(eqs).toEqual(expect.arrayContaining([['tenant_id', TENANT], ['arquivado', false]]))
      expect(eqs.some((a) => a[0] === 'corretor_id')).toBe(false)
    }
    expect(doBanco(calls, 'gestao_locacoes').find((c) => c.method === 'neq')?.args).toEqual(['status', 'Encerrada'])
    expect(doBanco(calls, 'gestao_locacoes').find((c) => c.method === 'select')?.args[0]).toBe('imovel_id')
  })

  test('filtro por situação vale para a lista toda: só o imóvel em locação, mesmo longe da 1ª página', async () => {
    const lista = Array.from({ length: 50 }, (_, n) => row(n + 1))
    const { ctx } = montar('dono', { properties: { data: lista, error: null }, gestao_locacoes: { data: [{ imovel_id: id(47) }], error: null } })
    const r = await listarImoveisPagina(ctx, { ...FILTRO_LISTA_IMOVEIS_VAZIO, situacao: 'em-locacao' })
    expect(r.itens.map((i) => i.id)).toEqual([id(47)])
    expect(r.total).toBe(1)
  })
})
