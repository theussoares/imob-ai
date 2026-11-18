import { describe, expect, test } from 'vitest'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import type { Locacao, Perfil, Processo } from '~~/layers/gestao/domain/types'
import { toLocacaoRow } from '~~/server/mappers/gestao-locacao'
import { listarPagina } from '~~/server/utils/gestao-locacao-servico'
import { listarVendasPaginaDoMembro, type CtxVendas } from '~~/server/utils/gestao-vendas'
import { fakeSupabase, type RecordedCall } from '../helpers/fake-supabase'

/**
 * Listas paginadas (vendas e locações). Cada teste documenta o que a paginação não pode fazer:
 * cruzar tenant ou corretor, trazer a lista inteira para uma página, ou esconder o corte da busca.
 */

const T = '11111111-1111-1111-1111-111111111111'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const IMOVEL = '22222222-2222-4222-8222-222222222222'

const eqs = (calls: RecordedCall[], tabela: string, col: string) =>
  calls.filter((c) => c.table === tabela && c.method === 'eq' && c.args[0] === col).map((c) => c.args[1])
const ranges = (calls: RecordedCall[]) => calls.filter((c) => c.method === 'range').map((c) => c.args)

// ------------------------------------------------------------------ vendas

function venda(id: string, vendedor: string, over: Partial<Processo> = {}): Processo {
  const base = processosSeed()[0]!
  return { ...base, id, corretorId: A, arquivado: false, vendedor: { ...base.vendedor, nome: vendedor }, ...over }
}
const rowV = (p: Processo) => ({ id: p.id, tenant_id: T, corretor_id: p.corretorId, status: p.status, arquivado: p.arquivado, etapa: p.etapa, versao: 1, dados: p, updated_at: '2026-11-17T10:00:00Z' })

function ctxV(perfil: Perfil, db: unknown, brokerId: string | null = null): CtxVendas {
  return { membro: { userId: 'u', tenantId: T, nome: 'F', brokerId }, matriz: matrizPadrao(), sessao: { perfil, nome: 'F', corretorId: brokerId }, db: db as CtxVendas['db'] }
}
const F = { arquivados: false, pagina: 1, q: '', status: '' }

describe('vendas paginadas', () => {
  test('sem busca o banco pagina: range da página, contagem exata e total do banco (não do tamanho da página)', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: [rowV(venda('V-2026-0001', 'Ana'))], error: null, count: 61 } })
    const r = await listarVendasPaginaDoMembro(ctxV('dono', client), { ...F, pagina: 3 })
    expect(ranges(calls)).toEqual([[48, 71]])
    expect(calls.find((c) => c.method === 'select')?.args[1]).toEqual({ count: 'exact' })
    expect(r).toMatchObject({ total: 61, pagina: 3, porPagina: 24, paginas: 3, truncado: false })
    expect(r.itens).toHaveLength(1)
  })

  test('tenant sempre; corretor sem verTodos só vê o seu; status filtra no banco; id desempata a ordem', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: [], error: null, count: 0 } })
    await listarVendasPaginaDoMembro(ctxV('corretor', client, A), { ...F, status: 'Em negociação' })
    expect(eqs(calls, 'gestao_vendas', 'tenant_id')).toEqual([T])
    expect(eqs(calls, 'gestao_vendas', 'corretor_id')).toEqual([A])
    expect(eqs(calls, 'gestao_vendas', 'status')).toEqual(['Em negociação'])
    expect(calls.filter((c) => c.method === 'order').map((c) => c.args[0])).toEqual(['updated_at', 'id'])
    expect(calls.some((c) => c.method === 'limit')).toBe(false)
  })

  test('arquivados continuam restritos a quem arquiva (mesmo critério da lista sem página)', async () => {
    const { client } = fakeSupabase({ gestao_vendas: { data: [], error: null, count: 0 } })
    await expect(listarVendasPaginaDoMembro(ctxV('corretor', client, A), { ...F, arquivados: true })).rejects.toMatchObject({ statusCode: 403 })
  })

  test('a lista mascara o CPF, como a lista sem página', async () => {
    const p = venda('V-2026-0001', 'Ana')
    const { client } = fakeSupabase({ gestao_vendas: { data: [rowV(p)], error: null, count: 1 } })
    const r = await listarVendasPaginaDoMembro(ctxV('dono', client), F)
    expect(r.itens[0]!.processo.vendedor.cpf).not.toContain(p.vendedor.cpf.slice(0, 6))
  })

  test('com busca: lê as linhas do filtro, casa sem acento em memória e pagina o que casou', async () => {
    const todas = [venda('V-2026-0003', 'José Silva'), venda('V-2026-0002', 'Maria Souza'), venda('V-2026-0001', 'Jose Pereira')]
    const { client, calls } = fakeSupabase({
      gestao_vendas: { data: todas.map(rowV), error: null },
      brokers: { data: [{ id: A, name: 'Carla' }], error: null },
    })
    const r = await listarVendasPaginaDoMembro(ctxV('dono', client), { ...F, q: 'jose' })
    expect(r.itens.map((i) => i.processo.id)).toEqual(['V-2026-0003', 'V-2026-0001'])
    expect(r.total).toBe(2)
    expect(eqs(calls, 'brokers', 'tenant_id')).toEqual([T])
    expect(eqs(calls, 'gestao_vendas', 'tenant_id')).toEqual([T])
  })

  test('com busca: lê em blocos de 1000 e avisa quando bate o teto de 5000', async () => {
    const bloco = Array.from({ length: 1000 }, (_, i) => rowV(venda(`V-2026-${String(i + 1).padStart(4, '0')}`, 'Ana')))
    const { client, calls } = fakeSupabase({
      gestao_vendas: Array.from({ length: 5 }, () => ({ data: bloco, error: null })),
      brokers: { data: [], error: null },
    })
    const r = await listarVendasPaginaDoMembro(ctxV('dono', client), { ...F, q: 'ana' })
    expect(ranges(calls)).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999]])
    expect(r.truncado).toBe(true)
    expect(r.itens).toHaveLength(24)
  })

  test('página além do fim (416 do PostgREST): lista vazia com o total, para a tela ir à última', async () => {
    const { client, calls } = fakeSupabase({
      gestao_vendas: [{ data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' } }, { data: null, error: null, count: 30 }],
    })
    const r = await listarVendasPaginaDoMembro(ctxV('dono', client), { ...F, pagina: 99 })
    expect(r).toMatchObject({ itens: [], total: 30, pagina: 99, paginas: 2 })
    expect(calls.filter((c) => c.method === 'select').map((c) => c.args[1])).toEqual([{ count: 'exact' }, { count: 'exact', head: true }])
    expect(eqs(calls, 'gestao_vendas', 'tenant_id')).toEqual([T, T])
  })

  test('erro do banco sobe (500), não vira lista vazia', async () => {
    const { client } = fakeSupabase({ gestao_vendas: { data: null, error: { message: 'boom' } } })
    await expect(listarVendasPaginaDoMembro(ctxV('dono', client), F)).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------- locações

function locacao(id: string, locador: string, corretorId = A): Locacao {
  const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador, locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1', corretorId }, { nome: 'C' }, '17/11/2026 10:00')
  if (!r.ok) throw new Error(r.erro)
  return { ...r.estado.locacoes[0]!, id }
}
const linhaL = (l: Locacao) => ({ ...toLocacaoRow(l, T), versao: 1, updated_at: '2026-11-17T10:00:00Z' })

function ctxL(perfil: Perfil, brokerId: string | null, results: Parameters<typeof fakeSupabase>[0]) {
  const { client, calls } = fakeSupabase(results)
  const c = {
    membro: { id: 'm', userId: 'u', tenantId: T, nome: 'F', perfil, brokerId },
    tenant: { id: T },
    sessao: { perfil, nome: 'F', corretorId: brokerId },
    matriz: matrizPadrao(),
    db: client,
  } as never
  return { c, calls }
}
const FL = { arquivadas: false, pagina: 1, q: '', status: '' }

describe('locações paginadas', () => {
  test('sem busca o banco pagina, com tenant, corretor e status no where', async () => {
    const { c, calls } = ctxL('corretor', A, { gestao_locacoes: { data: [linhaL(locacao('L-2026-0001', 'Ana'))], error: null, count: 30 } })
    const r = await listarPagina(c, { ...FL, pagina: 2, status: 'Em análise' })
    expect(ranges(calls)).toEqual([[24, 47]])
    expect(eqs(calls, 'gestao_locacoes', 'tenant_id')).toEqual([T])
    expect(eqs(calls, 'gestao_locacoes', 'corretor_id')).toEqual([A])
    expect(eqs(calls, 'gestao_locacoes', 'status')).toEqual(['Em análise'])
    expect(r).toMatchObject({ total: 30, pagina: 2, paginas: 2, truncado: false })
  })

  test('corretor sem vínculo: página vazia e nenhuma query à tabela', async () => {
    const { c, calls } = ctxL('corretor', null, { gestao_locacoes: { data: [linhaL(locacao('L-2026-0001', 'Ana'))], error: null, count: 1 } })
    const r = await listarPagina(c, FL)
    expect(r).toMatchObject({ itens: [], total: 0 })
    expect(calls.some((x) => x.table === 'gestao_locacoes')).toBe(false)
  })

  test('página além do fim (416): vazia com o total', async () => {
    const { c } = ctxL('dono', null, {
      gestao_locacoes: [{ data: null, error: { code: 'PGRST103', message: 'x' } }, { data: null, error: null, count: 5 }],
    })
    expect(await listarPagina(c, { ...FL, pagina: 9 })).toMatchObject({ itens: [], total: 5, pagina: 9, paginas: 1 })
  })

  test('com busca: casa em memória e pagina; arquivadas seguem restritas', async () => {
    const { c } = ctxL('dono', null, {
      gestao_locacoes: { data: [linhaL(locacao('L-2026-0002', 'José')), linhaL(locacao('L-2026-0001', 'Maria'))], error: null },
      brokers: { data: [], error: null },
    })
    const r = await listarPagina(c, { ...FL, q: 'jose' })
    expect(r.itens.map((i) => i.locacao.id)).toEqual(['L-2026-0002'])
    expect(r.total).toBe(1)
    const { c: c2 } = ctxL('corretor', A, { gestao_locacoes: { data: [], error: null, count: 0 } })
    await expect(listarPagina(c2, { ...FL, arquivadas: true })).rejects.toMatchObject({ statusCode: 403 })
  })
})
