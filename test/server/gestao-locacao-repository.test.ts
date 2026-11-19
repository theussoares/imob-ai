import { describe, expect, test } from 'vitest'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { toLocacaoRow } from '~~/server/mappers/gestao-locacao'
import {
  buscarLocacao,
  gravarLocacao,
  inserirLocacao,
  listarLocacoes,
  ultimoIdDoAno,
} from '~~/server/repositories/gestao-locacao.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

const T = 'tenant-1'
const CORRETOR = '11111111-1111-4111-8111-111111111111'

function nova() {
  const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador: 'Ana', locatario: 'Bruno', imovelId: 'im1', imovel: 'Casa', corretorId: CORRETOR }, { nome: 'C' }, '17/11/2026 10:00')
  if (!r.ok) throw new Error(r.erro)
  return r.estado.locacoes[0]!
}
const linha = (versao = 1) => ({ ...toLocacaoRow(nova(), T), versao, updated_at: '2026-11-17T10:00:00Z' })

describe('repository de locações do gestão', () => {
  test('toda leitura leva tenant_id; corretor leva também corretor_id', async () => {
    const { client, calls } = fakeSupabase({ gestao_locacoes: { data: [linha()], error: null } })
    await listarLocacoes(client, T, { arquivadas: false, corretorId: CORRETOR })
    expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'tenant_id')?.args[1]).toBe(T)
    expect(hadEq(calls, 'gestao_locacoes', 'corretor_id')).toBe(true)
    expect(calls.find((c) => c.method === 'limit')?.args[0]).toBe(200)
  })

  test('corretor sem vínculo não vê nada, e nem consulta o banco', async () => {
    const { client, calls } = fakeSupabase({})
    expect(await listarLocacoes(client, T, { arquivadas: false, corretorId: null })).toEqual([])
    expect(await buscarLocacao(client, T, 'L-2026-0001', { corretorId: null })).toBeNull()
    expect(calls).toHaveLength(0)
  })

  test('nunca usa select(*) — colunas explícitas', async () => {
    const { client, calls } = fakeSupabase({ gestao_locacoes: [{ data: [], error: null }, { data: null, error: null }] })
    await listarLocacoes(client, T, { arquivadas: false })
    await buscarLocacao(client, T, 'L-2026-0001')
    const selects = calls.filter((c) => c.method === 'select').map((c) => String(c.args[0]))
    expect(selects.length).toBe(2)
    for (const s of selects) expect(s).not.toBe('*')
  })

  test('devolve modelo de domínio com versão, não a linha', async () => {
    const { client } = fakeSupabase({ gestao_locacoes: { data: linha(3), error: null } })
    const item = await buscarLocacao(client, T, 'L-2026-0001')
    expect(item?.versao).toBe(3)
    expect(item?.locacao.tipo).toBe('locacao')
    expect(item).not.toHaveProperty('dados')
  })

  test('gravar: update condicionado à versão lida e ao tenant', async () => {
    const { client, calls } = fakeSupabase({ gestao_locacoes: { data: [{ id: 'L-2026-0001' }], error: null } })
    expect(await gravarLocacao(client, T, nova(), 5)).toBe('ok')
    const upd = calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>
    expect(upd.versao).toBe(6)
    expect(upd).not.toHaveProperty('tenant_id')
    expect(upd).not.toHaveProperty('id')
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => [c.args[0], c.args[1]])
    expect(eqs).toEqual(expect.arrayContaining([['tenant_id', T], ['versao', 5]]))
  })

  test('gravar: zero linhas afetadas = conflito', async () => {
    const { client } = fakeSupabase({ gestao_locacoes: { data: [], error: null } })
    expect(await gravarLocacao(client, T, nova(), 5)).toBe('conflito')
  })

  test('inserir: 23505 vira duplicada; outro erro sobe', async () => {
    const dup = fakeSupabase({ gestao_locacoes: { data: null, error: { code: '23505' } } })
    expect(await inserirLocacao(dup.client, T, nova())).toBe('duplicada')
    const ruim = fakeSupabase({ gestao_locacoes: { data: null, error: { code: '42P01', message: 'x' } } })
    await expect(inserirLocacao(ruim.client, T, nova())).rejects.toBeTruthy()
    const ok = fakeSupabase({ gestao_locacoes: { data: null, error: null } })
    expect(await inserirLocacao(ok.client, T, nova())).toBe('ok')
    expect((ok.calls.find((c) => c.method === 'insert')!.args[0] as { tenant_id: string }).tenant_id).toBe(T)
  })

  test('numeração: busca o último id do ano no tenant', async () => {
    const { client, calls } = fakeSupabase({ gestao_locacoes: { data: [{ id: 'L-2026-0007' }], error: null } })
    expect(await ultimoIdDoAno(client, T, 2026)).toBe('L-2026-0007')
    expect(hadEq(calls, 'gestao_locacoes', 'tenant_id')).toBe(true)
  })
})
