import { describe, expect, test, vi } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import type { Perfil, Processo } from '~~/layers/gestao/domain/types'
import {
  abrirVendaDoMembro,
  executarAcaoVenda,
  lerVendaDoMembro,
  listarVendasDoMembro,
  type CtxVendas,
  type DepsVendas,
} from '~~/server/utils/gestao-vendas'
import { fakeSupabase, hadEq, type RecordedCall } from '../helpers/fake-supabase'

/**
 * Vendas do gestão: o que as quatro rotas /api/gestao/vendas/** garantem.
 * Cada teste documenta a ameaça que cobre (Review Focus 1 e 2 do plano).
 */

const TENANT = '11111111-1111-1111-1111-111111111111'
const CORRETOR_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CORRETOR_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const ID = 'V-2026-0142'
const ANO = new Date().getFullYear()

function processoDoCorretor(corretorId: string, over: Partial<Processo> = {}): Processo {
  const base = processosSeed().find((p) => p.id === ID)!
  return { ...base, corretorId, captadorId: corretorId, status: 'Em negociação', etapa: 5, concluidas: [true, true, true, true, false, false, false, false], arquivado: false, ...over }
}

function row(p: Processo, versao = 1) {
  return { id: p.id, tenant_id: TENANT, corretor_id: p.corretorId, status: p.status, arquivado: p.arquivado, etapa: p.etapa, versao, dados: p, updated_at: '2026-11-17T10:00:00Z' }
}

function ctx(perfil: Perfil, db: unknown, brokerId: string | null = null): CtxVendas {
  return {
    membro: { userId: 'u-1', tenantId: TENANT, nome: 'Fulana Teste', brokerId },
    matriz: matrizPadrao(),
    sessao: { perfil, nome: 'Fulana Teste', corretorId: brokerId },
    db: db as CtxVendas['db'],
  }
}

const deps = (): DepsVendas & { registrarEvento: ReturnType<typeof vi.fn> } => ({
  registrarEvento: vi.fn(async () => {}),
  comissaoPadrao: async () => 6,
})

const eqs = (calls: RecordedCall[], table: string, col: string) =>
  calls.filter((c) => c.table === table && c.method === 'eq' && c.args[0] === col).map((c) => c.args[1])

describe('leitura — escopo por tenant e por corretor', () => {
  test('corretor B pede o processo do corretor A pelo id → 404, e a query já nasce escopada', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: null, error: null } })
    await expect(lerVendaDoMembro(ctx('corretor', client, CORRETOR_B), ID)).rejects.toMatchObject({ statusCode: 404 })
    expect(eqs(calls, 'gestao_vendas', 'tenant_id')).toEqual([TENANT])
    expect(eqs(calls, 'gestao_vendas', 'corretor_id')).toEqual([CORRETOR_B])
  })

  test('o corretor lê o próprio; o recepcionista (verTodos) lê qualquer um do tenant, sem filtro de corretor', async () => {
    const dono = processoDoCorretor(CORRETOR_A)
    const a = fakeSupabase({ gestao_vendas: { data: row(dono), error: null } })
    const r1 = await lerVendaDoMembro(ctx('corretor', a.client, CORRETOR_A), ID)
    expect(r1.processo.id).toBe(ID)
    const b = fakeSupabase({ gestao_vendas: { data: row(dono), error: null } })
    await lerVendaDoMembro(ctx('recepcao', b.client), ID)
    expect(hadEq(b.calls, 'gestao_vendas', 'tenant_id')).toBe(true)
    expect(hadEq(b.calls, 'gestao_vendas', 'corretor_id')).toBe(false)
  })

  test('id fora do formato V-AAAA-NNNN nem consulta o banco', async () => {
    const { client, calls } = fakeSupabase({})
    await expect(lerVendaDoMembro(ctx('dono', client), "x' or '1'='1")).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toHaveLength(0)
  })

  test('lista: tenant sempre; corretor sem verTodos filtra por corretor_id; limite 200 por updated_at desc', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: [row(processoDoCorretor(CORRETOR_A))], error: null } })
    await listarVendasDoMembro(ctx('corretor', client, CORRETOR_A), { arquivados: false })
    expect(eqs(calls, 'gestao_vendas', 'tenant_id')).toEqual([TENANT])
    expect(eqs(calls, 'gestao_vendas', 'corretor_id')).toEqual([CORRETOR_A])
    expect(calls.find((c) => c.method === 'limit')?.args[0]).toBe(200)
    expect(calls.find((c) => c.method === 'order')?.args).toEqual(['updated_at', { ascending: false }])
  })

  test('corretor sem vínculo com corretor não enxerga nada (filtro impossível, não filtro nenhum)', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: [], error: null } })
    await listarVendasDoMembro(ctx('corretor', client, null), { arquivados: false })
    expect(eqs(calls, 'gestao_vendas', 'corretor_id')).toEqual(['00000000-0000-0000-0000-000000000000'])
  })

  test('arquivados: só quem arquiva/usa a lixeira (mesmo critério do menu)', async () => {
    const { client } = fakeSupabase({ gestao_vendas: { data: [], error: null } })
    await expect(listarVendasDoMembro(ctx('corretor', client, CORRETOR_A), { arquivados: true })).rejects.toMatchObject({ statusCode: 403 })
    await expect(listarVendasDoMembro(ctx('juridico', client), { arquivados: true })).resolves.toEqual([])
  })

  test('uma linha corrompida não derruba a lista', async () => {
    const { client } = fakeSupabase({
      gestao_vendas: { data: [{ ...row(processoDoCorretor(CORRETOR_A)), dados: { lixo: true } }, row(processoDoCorretor(CORRETOR_A, { id: 'V-2026-0143' }))], error: null },
    })
    const lista = await listarVendasDoMembro(ctx('dono', client), { arquivados: false })
    expect(lista).toHaveLength(1)
  })
})

describe('recorte de valores', () => {
  test('sem `valores`: o payload não traz pct, adiantamentos nem fin, nem as linhas de histórico que citam o valor', async () => {
    const p = processoDoCorretor(CORRETOR_A, {
      adiantamentos: [{ id: 'a1', resp: 'vendedor', valor: 5000, data: '2026-11-01', quem: 'X' }],
      hist: [
        { acao: 'Registrou adiantamento de R$ 5.000,00 (vendedor)', quem: 'X', quando: '01/11/2026 10:00' },
        { acao: 'Concluiu a etapa 1', quem: 'X', quando: '01/11/2026 09:00' },
      ],
    })
    const { client } = fakeSupabase({ gestao_vendas: { data: row(p), error: null } })
    const r = await lerVendaDoMembro(ctx('recepcao', client), ID)
    const json = JSON.stringify(r)
    expect(r.processo).not.toHaveProperty('pct')
    expect(r.processo).not.toHaveProperty('adiantamentos')
    expect(r.processo).not.toHaveProperty('fin')
    expect(json).not.toContain('5.000')
    expect(r.processo.hist).toHaveLength(1)
  })

  test('com `valores` (jurídico, dono) o processo vem inteiro', async () => {
    const { client } = fakeSupabase({ gestao_vendas: { data: row(processoDoCorretor(CORRETOR_A)), error: null } })
    const r = await lerVendaDoMembro(ctx('juridico', client), ID)
    expect(r.processo).toHaveProperty('pct')
    expect(r.processo).toHaveProperty('fin')
  })

  test.each(['registrarAdiantamento', 'removerAdiantamento', 'salvarFinanceiro'])('%s sem `valores` → 403 e nada é gravado', async (acao) => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: row(processoDoCorretor(CORRETOR_A)), error: null } })
    await expect(executarAcaoVenda(ctx('recepcao', client), ID, { acao, dados: {} }, deps())).rejects.toMatchObject({ statusCode: 400 })
    // dados vazios falham no Zod (400); com dados válidos o 403 vem da permissão:
    const dados = acao === 'registrarAdiantamento' ? { resp: 'imob', valor: 10, data: '2026-11-01' } : acao === 'removerAdiantamento' ? { adiantamentoId: 'a1' } : { valor: 1000, fin: { forma: 'À vista', financiado: 0, entrada: 0, fgts: 0, proprios: 0 } }
    await expect(executarAcaoVenda(ctx('recepcao', client), ID, { acao, dados }, deps())).rejects.toMatchObject({ statusCode: 403 })
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })
})

describe('ações — permissão, regra, concorrência', () => {
  test('corretor B executa ação no processo do corretor A → 404 (não 403), sem gravar nem registrar evento', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: null, error: null } })
    const d = deps()
    await expect(
      executarAcaoVenda(ctx('corretor', client, CORRETOR_B), ID, { acao: 'salvarObservacao', dados: { obs: 'x' } }, d),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(calls.some((c) => c.method === 'update')).toBe(false)
    expect(d.registrarEvento).not.toHaveBeenCalled()
  })

  test('duas abas: a segunda grava com versão velha, recebe 409 e a resposta não é um sucesso', async () => {
    const p = processoDoCorretor(CORRETOR_A)
    const { client, calls } = fakeSupabase({
      // leitura devolve versao 7; o update não atinge linha nenhuma (outra aba já subiu para 8)
      gestao_vendas: [{ data: row(p, 7), error: null }, { data: [], error: null }],
    })
    const d = deps()
    await expect(
      executarAcaoVenda(ctx('recepcao', client), ID, { acao: 'salvarPessoa', dados: { quem: 'vendedor', cpf: '', telefone: '', email: '' } }, d),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Este processo foi alterado por outra pessoa. Recarregue.' })
    // o update foi condicionado à versão LIDA e ao tenant
    const upd = calls.filter((c) => c.method === 'eq' && c.args[0] === 'versao')
    expect(upd.map((c) => c.args[1])).toEqual([7])
    expect(eqs(calls, 'gestao_vendas', 'tenant_id')).toEqual([TENANT, TENANT])
    expect(d.registrarEvento).not.toHaveBeenCalled()
  })

  test('sucesso: grava versão+1, ator do servidor no hist, e registra o evento com o tenant do contexto', async () => {
    const p = processoDoCorretor(CORRETOR_A)
    const { client, calls } = fakeSupabase({ gestao_vendas: [{ data: row(p, 2), error: null }, { data: [{ id: ID }], error: null }] })
    const d = deps()
    const r = await executarAcaoVenda(
      ctx('recepcao', client),
      ID,
      // tenantId/ator/quando no corpo não têm efeito: o schema os descarta
      { acao: 'salvarImovel', dados: { matriculaMae: true, valorVenal: 90000, tenantId: 'OUTRO', ator: 'Hacker' }, tenantId: 'OUTRO' },
      d,
    )
    expect(r.versao).toBe(3)
    const update = calls.find((c) => c.method === 'update')!
    const gravado = update.args[0] as { versao: number; dados: Processo }
    expect(gravado.versao).toBe(3)
    expect(gravado.dados.hist[0]!.quem).toBe('Fulana Teste')
    expect(JSON.stringify(gravado)).not.toContain('OUTRO')
    expect(eqs(calls, 'gestao_vendas', 'tenant_id')).toEqual([TENANT, TENANT])
    expect(d.registrarEvento).toHaveBeenCalledWith(client, TENANT, { atorUserId: 'u-1', atorNome: 'Fulana Teste', acao: 'venda.salvarImovel', alvoTipo: 'venda', alvoId: ID })
  })

  test('regra do domínio recusa → 422 com a frase, nada gravado (concluir etapa fora de ordem)', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: row(processoDoCorretor(CORRETOR_A)), error: null } })
    await expect(
      executarAcaoVenda(ctx('recepcao', client), ID, { acao: 'concluirEtapa', dados: { etapa: 2 } }, deps()),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Conclua as etapas em ordem.' })
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  test('as etapas 6 e 7 têm dono: recepção conclui a 6, não a 7; jurídico a 7, não a 5', async () => {
    const em = (etapa: number) => fakeSupabase({ gestao_vendas: { data: row(processoDoCorretor(CORRETOR_A, { etapa })), error: null } })
    await expect(executarAcaoVenda(ctx('recepcao', em(7).client), ID, { acao: 'concluirEtapa', dados: { etapa: 7 } }, deps())).rejects.toMatchObject({ statusCode: 403 })
    await expect(executarAcaoVenda(ctx('juridico', em(5).client), ID, { acao: 'concluirEtapa', dados: { etapa: 5 } }, deps())).rejects.toMatchObject({ statusCode: 403 })
  })

  test('editar = proprio: corretor edita o próprio processo; recepção com matriz alterada não edita o de outro', async () => {
    const p = processoDoCorretor(CORRETOR_A)
    const a = fakeSupabase({ gestao_vendas: [{ data: row(p), error: null }, { data: [{ id: ID }], error: null }] })
    await expect(
      executarAcaoVenda(ctx('corretor', a.client, CORRETOR_A), ID, { acao: 'salvarImovel', dados: { matriculaMae: false, valorVenal: 1 } }, deps()),
    ).resolves.toMatchObject({ versao: 2 })

    const b = fakeSupabase({ gestao_vendas: { data: row(p), error: null } })
    const c = ctx('recepcao', b.client)
    c.matriz.editar.recepcao = 'proprio'
    await expect(executarAcaoVenda(c, ID, { acao: 'salvarImovel', dados: { matriculaMae: false, valorVenal: 1 } }, deps())).rejects.toMatchObject({ statusCode: 403 })
  })

  test('ação desconhecida → 400; nome herdado do protótipo do objeto não passa', async () => {
    const { client } = fakeSupabase({})
    await expect(executarAcaoVenda(ctx('dono', client), ID, { acao: 'nao-existe', dados: {} }, deps())).rejects.toMatchObject({ statusCode: 400 })
    await expect(executarAcaoVenda(ctx('dono', client), ID, { acao: 'constructor', dados: {} }, deps())).rejects.toMatchObject({ statusCode: 400 })
  })

  test('salvarAbertura: corretor de outro tenant → 422; quem não vê todos não reatribui o processo', async () => {
    const p = processoDoCorretor(CORRETOR_A)
    const dados = { vendedor: { nome: 'V', cpf: '' }, comprador: { nome: 'C', cpf: '' }, imovel: 'Casa', corretorId: CORRETOR_B, captadorId: CORRETOR_A, preliminar: { existe: false, arquivo: null } }
    const fora = fakeSupabase({ brokers: { data: [{ id: CORRETOR_A }], error: null } })
    await expect(executarAcaoVenda(ctx('recepcao', fora.client), ID, { acao: 'salvarAbertura', dados }, deps())).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Corretor inválido.' })

    const ok = fakeSupabase({ brokers: { data: [{ id: CORRETOR_A }, { id: CORRETOR_B }], error: null }, gestao_vendas: [{ data: row(p), error: null }, { data: [{ id: ID }], error: null }] })
    await executarAcaoVenda(ctx('corretor', ok.client, CORRETOR_A), ID, { acao: 'salvarAbertura', dados }, deps())
    const gravado = ok.calls.find((c) => c.method === 'update')!.args[0] as { corretor_id: string }
    expect(gravado.corretor_id).toBe(CORRETOR_A)
  })
})

describe('abrir processo', () => {
  const corpo = { imovel: 'Casa 12', vendedor: 'Maria', comprador: 'João' }

  test('corretor abre sempre em seu nome, mesmo mandando outro corretorId; tenant e pct vêm do servidor', async () => {
    const { client, calls } = fakeSupabase({
      brokers: { data: [{ id: CORRETOR_A }], error: null },
      gestao_vendas: [{ data: [{ id: `V-${ANO}-0007` }], error: null }, { data: null, error: null }],
    })
    const d = deps()
    const r = await abrirVendaDoMembro(ctx('corretor', client, CORRETOR_A), { ...corpo, corretorId: CORRETOR_B, tenantId: 'OUTRO', pct: 99 }, d)
    expect(r.processo.id).toBe(`V-${ANO}-0008`)
    const ins = calls.find((c) => c.method === 'insert')!.args[0] as { tenant_id: string; corretor_id: string; dados: Processo }
    expect(ins.tenant_id).toBe(TENANT)
    expect(ins.corretor_id).toBe(CORRETOR_A)
    expect(ins.dados.pct).toBe(6)
    expect(JSON.stringify(ins)).not.toContain('OUTRO')
    expect(d.registrarEvento).toHaveBeenCalledWith(client, TENANT, expect.objectContaining({ acao: 'venda.abrir' }))
  })

  test('número tomado por abertura simultânea (23505): tenta de novo com o seguinte', async () => {
    const { client } = fakeSupabase({
      brokers: { data: [{ id: CORRETOR_A }], error: null },
      gestao_vendas: [
        { data: [], error: null }, { data: null, error: { code: '23505' } },
        { data: [{ id: `V-${ANO}-0001` }], error: null }, { data: null, error: null },
      ],
    })
    const r = await abrirVendaDoMembro(ctx('recepcao', client), { ...corpo, corretorId: CORRETOR_A }, deps())
    expect(r.processo.id).toBe(`V-${ANO}-0002`)
  })

  test('corretor de outro tenant → 422; sem permissão `criar` → 403; faltando campo → 422 do domínio', async () => {
    const fora = fakeSupabase({ brokers: { data: [], error: null } })
    await expect(abrirVendaDoMembro(ctx('recepcao', fora.client), { ...corpo, corretorId: CORRETOR_B }, deps())).rejects.toMatchObject({ statusCode: 422 })
    const c = ctx('corretor', fora.client, CORRETOR_A)
    c.matriz.criar.corretor = 'nao'
    await expect(abrirVendaDoMembro(c, corpo, deps())).rejects.toMatchObject({ statusCode: 403 })
    const ok = fakeSupabase({ brokers: { data: [{ id: CORRETOR_A }], error: null }, gestao_vendas: { data: [], error: null } })
    await expect(abrirVendaDoMembro(ctx('recepcao', ok.client), { ...corpo, vendedor: ' ', corretorId: CORRETOR_A }, deps())).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Informe o vendedor.' })
  })
})
