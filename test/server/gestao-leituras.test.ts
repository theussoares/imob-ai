import { beforeEach, describe, expect, test, vi } from 'vitest'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import type { Locacao, Perfil, Processo } from '~~/layers/gestao/domain/types'
import { toLocacaoRow } from '~~/server/mappers/gestao-locacao'
import { memoriaSupabase } from '../helpers/memoria-supabase'

/**
 * Leituras agregadas (F6). Cada teste documenta a ameaça: dinheiro para quem não tem
 * `valores`, contrato de outro corretor ou de outro tenant, CPF inteiro no histórico.
 * Usa `memoriaSupabase`, que de fato filtra por tenant/corretor: com um fake de
 * respostas roteirizadas o teste passaria mesmo sem o `where`.
 */

vi.mock('~~/server/utils/gestao-auth', () => ({
  exigirPermissao: (ctx: { matriz: Record<string, Record<string, string>>; membro: { perfil: string } }, chave: string) => {
    if ((ctx.matriz[chave]?.[ctx.membro.perfil] ?? 'nao') === 'nao') throw createError({ statusCode: 403, statusMessage: 'Sem permissão.' })
  },
}))

const { financeiro, dashboard, auditoria, consultas, consultar } = await import('~~/server/utils/gestao-leituras')

const T = '11111111-1111-4111-8111-111111111111'
const OUTRO = '99999999-9999-4999-8999-999999999999'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const IMOVEL = '22222222-2222-4222-8222-222222222222'
const CPF = '529.982.247-25'

function venda(corretorId: string, tenant = T, id = 'V-2026-0142') {
  const base = processosSeed().find((p) => p.id === 'V-2026-0142')!
  const p: Processo = { ...base, id, corretorId, captadorId: corretorId, status: 'Em negociação', arquivado: false }
  return { id, tenant_id: tenant, corretor_id: corretorId, status: p.status, arquivado: false, etapa: p.etapa, versao: 1, dados: p, updated_at: '2026-11-17T10:00:00Z' }
}

function locacaoAtiva(corretorId: string, tenant = T): Locacao {
  const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador: 'Ana', locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1', corretorId }, { nome: 'C' }, '17/11/2026 10:00')
  if (!r.ok) throw new Error(r.erro)
  return {
    ...r.estado.locacoes[0]!,
    status: 'Ativa',
    contrato: { valor: 3200, diaVencimento: 10, inicio: '2026-01-01', fim: '2027-01-01', reajuste: 'IGP-M', taxaPct: 8 },
    cobrancas: [{ id: 'cb-2020-01', competencia: '2020-01', valor: 3200, vencimento: '2020-01-10' }],
  } as Locacao
}
const linhaLoc = (l: Locacao, tenant = T) => ({ ...toLocacaoRow(l, tenant), versao: 1, updated_at: '2026-11-17T10:00:00Z' })

function ctx(perfil: Perfil, brokerId: string | null, db: unknown, matriz = matrizPadrao()) {
  return {
    membro: { id: 'm1', userId: 'u-1', tenantId: T, nome: 'Fulana', perfil, brokerId },
    tenant: { id: T },
    sessao: { perfil, nome: 'Fulana', corretorId: brokerId },
    matriz,
    db,
  } as never
}
const erro = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { statusCode?: number } | null

let mem: ReturnType<typeof memoriaSupabase>
beforeEach(() => {
  mem = memoriaSupabase({
    gestao_vendas: [venda(A), venda(B, T, 'V-2026-0143'), venda(A, OUTRO, 'V-2026-0900')],
    gestao_locacoes: [linhaLoc(locacaoAtiva(A)), linhaLoc({ ...locacaoAtiva(B), id: 'L-2026-0002' }), linhaLoc({ ...locacaoAtiva(A), id: 'L-2026-0003' }, OUTRO)],
    gestao_documentos: [],
    gestao_eventos: [],
    gestao_consultas: [],
  })
})

describe('financeiro', () => {
  test('recepção não tem `valores`: 403 e nenhuma query', async () => {
    expect((await erro(financeiro(ctx('recepcao', null, mem.db), '')))?.statusCode).toBe(403)
    expect(mem.consultas).toHaveLength(0)
  })

  test('jurídico vê vendas e aluguéis de todos os corretores do tenant, e só do tenant', async () => {
    const r = await financeiro(ctx('juridico', null, mem.db), '')
    expect(r.vendas.linhas.map((l) => l.id).sort()).toEqual(['V-2026-0142', 'V-2026-0143'])
    expect(r.locacoes.linhas.map((l) => l.locacaoId).sort()).toEqual(['L-2026-0001', 'L-2026-0002'])
    expect(r.locacoes.emAtraso).toBe(6400)
    expect(mem.consultas.every((c) => c.eq.tenant_id === T)).toBe(true)
  })

  test('corretor a quem se deu `valores` continua preso aos próprios contratos', async () => {
    const m = matrizPadrao()
    m.valores.corretor = 'sim'
    const r = await financeiro(ctx('corretor', A, mem.db, m), '')
    expect(r.vendas.linhas.map((l) => l.id)).toEqual(['V-2026-0142'])
    expect(r.locacoes.linhas.map((l) => l.locacaoId)).toEqual(['L-2026-0001'])
  })

  test('competência fora de AAAA-MM é 422; válida filtra os aluguéis', async () => {
    expect((await erro(financeiro(ctx('dono', null, mem.db), "2026-13'")))?.statusCode).toBe(422)
    expect((await financeiro(ctx('dono', null, mem.db), '2030-01')).locacoes.linhas).toEqual([])
  })
})

describe('dashboard', () => {
  test('corretor conta só os contratos dele; dono conta os do tenant', async () => {
    const c = await dashboard(ctx('corretor', A, mem.db))
    expect(c.vendas.andamento).toBe(1)
    expect(c.locacoes.ativas).toBe(1)
    const d = await dashboard(ctx('dono', null, mem.db))
    expect(d.vendas.andamento).toBe(2)
    expect(d.locacoes.ativas).toBe(2)
  })

  test('corretor sem vínculo não vê nada (e não «tudo» por esquecimento do filtro)', async () => {
    const r = await dashboard(ctx('corretor', null, mem.db))
    expect(r.vendas.andamento).toBe(0)
    expect(r.locacoes.ativas).toBe(0)
  })

  test('o payload não carrega valor em R$', async () => {
    const r = await dashboard(ctx('recepcao', null, mem.db))
    expect(JSON.stringify(r)).not.toMatch(/R\$|3200|3\.200/)
  })

  test('documentos a conferir contam só os de contratos visíveis e do tenant', async () => {
    const doc = (alvo: string, tenant = T) => ({ id: `d-${alvo}-${tenant}`, tenant_id: tenant, alvo_tipo: 'venda', alvo_id: alvo, requisito: null, nome: 'x.pdf', categoria: 'Pessoais', estado: 'enviado', tamanho: 1, versao: 1, mime: null, enviado_por: 'u', apagado_por: null, apagado_em: null, created_at: '2026-11-17T10:00:00Z', updated_at: '2026-11-17T10:00:00Z' })
    mem = memoriaSupabase({
      gestao_vendas: [venda(A), venda(B, T, 'V-2026-0143')],
      gestao_locacoes: [],
      gestao_documentos: [doc('V-2026-0142'), doc('V-2026-0143'), doc('V-2026-0142', OUTRO)],
    })
    expect((await dashboard(ctx('corretor', A, mem.db))).documentosParaConferir).toBe(1)
    expect((await dashboard(ctx('recepcao', null, mem.db))).documentosParaConferir).toBe(2)
  })
})

describe('auditoria', () => {
  const ev = (tenant: string, nome: string, n: number) => ({ id: n, tenant_id: tenant, ator_user_id: 'uuid-secreto', ator_nome: nome, acao: 'Fez algo', alvo_tipo: 'venda', alvo_id: 'V-1', quando: `2026-11-1${n}T10:00:00Z` })

  test('só com `auditoria`', async () => {
    expect((await erro(auditoria(ctx('recepcao', null, mem.db), {})))?.statusCode).toBe(403)
  })

  test('devolve só eventos do tenant, sem o uuid do autor, e lista as pessoas', async () => {
    mem = memoriaSupabase({ gestao_eventos: [ev(T, 'Zé', 1), ev(T, 'Ana', 2), ev(OUTRO, 'Intruso', 3)] })
    const r = await auditoria(ctx('juridico', null, mem.db), {})
    expect(r.eventos).toHaveLength(2)
    expect(JSON.stringify(r)).not.toContain('uuid-secreto')
    expect(r.pessoas).toEqual(['Ana', 'Zé'])
    expect(mem.consultas.every((c) => c.eq.tenant_id === T)).toBe(true)
  })

  test('data inválida no filtro é 422', async () => {
    expect((await erro(auditoria(ctx('dono', null, mem.db), { de: '17/11/2026' })))?.statusCode).toBe(422)
  })
})

describe('consultas', () => {
  test('só com `consulta`: corretor 403 no GET e no POST', async () => {
    expect((await erro(consultas(ctx('corretor', A, mem.db))))?.statusCode).toBe(403)
    expect((await erro(consultar(ctx('corretor', A, mem.db), { documento: CPF, finalidade: 'Venda' })))?.statusCode).toBe(403)
  })

  test('o documento inteiro não chega ao banco, ao evento nem à resposta; ator vem do servidor', async () => {
    const c = await consultar(ctx('recepcao', null, mem.db), { documento: CPF, finalidade: 'Locação', quem: 'Hacker', tenantId: OUTRO })
    expect(c).toMatchObject({ id: 'C-0001', documentoMascarado: '529.***.***-25', quem: 'Fulana', simulada: true })
    const gravado = JSON.stringify([mem.tabelas.gestao_consultas, mem.tabelas.gestao_eventos, c])
    expect(gravado).not.toContain('529.982')
    expect(gravado).not.toContain('52998224725')
    expect(mem.tabelas.gestao_consultas![0]).toMatchObject({ tenant_id: T, ator_user_id: 'u-1' })
    expect(mem.tabelas.gestao_eventos).toHaveLength(1)
  })

  test('numera por tenant e o histórico lista só o do tenant', async () => {
    mem = memoriaSupabase({ gestao_consultas: [{ tenant_id: OUTRO, id: 'C-0007' }] })
    const c = await consultar(ctx('dono', null, mem.db), { documento: CPF, finalidade: 'Venda' })
    expect(c.id).toBe('C-0001')
    // `quando` é default do banco; a memória não o preenche.
    for (const r of mem.tabelas.gestao_consultas!) r.quando ??= '2026-11-17T13:00:00Z'
    expect((await consultas(ctx('dono', null, mem.db))).map((x) => x.id)).toEqual(['C-0001'])
  })

  test('documento inválido e finalidade ausente: 422, nada gravado', async () => {
    expect((await erro(consultar(ctx('dono', null, mem.db), { documento: '111.111.111-11', finalidade: 'Venda' })))?.statusCode).toBe(422)
    expect((await erro(consultar(ctx('dono', null, mem.db), { documento: CPF })))?.statusCode).toBe(422)
    expect(mem.tabelas.gestao_consultas).toHaveLength(0)
  })

  test('contrato citado de outro corretor ou de outro tenant: 404, igual a «não existe»', async () => {
    const m = matrizPadrao()
    m.consulta.corretor = 'sim'
    const c = ctx('corretor', A, mem.db, m)
    expect((await erro(consultar(c, { documento: CPF, finalidade: 'Venda', contratoId: 'V-2026-0143' })))?.statusCode).toBe(404)
    expect((await erro(consultar(c, { documento: CPF, finalidade: 'Venda', contratoId: 'V-2026-0900' })))?.statusCode).toBe(404)
    expect((await consultar(c, { documento: CPF, finalidade: 'Venda', contratoId: 'V-2026-0142' })).contratoId).toBe('V-2026-0142')
  })
})
