import { describe, expect, test, vi } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import type { Perfil, Processo } from '~~/layers/gestao/domain/types'
import { abrirVendaDoMembro, executarAcaoVenda, lerVendaDoMembro, listarVendasDoMembro, type CtxVendas, type DepsVendas } from '~~/server/utils/gestao-vendas'
import { matrizDoBanco } from '~~/server/mappers/gestao-settings.mapper'
import { validarMatrizPedido } from '~~/server/utils/gestao-membros'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * Financeiro livre com análise: o corretor preenche o financeiro do PRÓPRIO processo, mas só o que passou por
 * quem tem `valores` vale. Cada teste nomeia a ameaça (o corretor aprovando o que ele mesmo preencheu, ler o
 * financeiro do colega, editar depois de enviado).
 */

const TENANT = '11111111-1111-1111-1111-111111111111'
const CORRETOR_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CORRETOR_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ID = 'V-2026-0142'

function processo(corretorId: string, over: Partial<Processo> = {}): Processo {
  const base = processosSeed().find((p) => p.id === ID)!
  return {
    ...base, corretorId, captadorId: corretorId, status: 'Em negociação', etapa: 5, concluidas: [true, true, true, true, false, false, false, false], arquivado: false,
    valor: 400000, pct: 5, adiantamentos: [{ id: 'a1', resp: 'vendedor', valor: 5000, data: '2026-11-01', quem: 'X' }],
    ...over,
  }
}

const row = (p: Processo, versao = 1) => ({ id: p.id, tenant_id: TENANT, corretor_id: p.corretorId, status: p.status, arquivado: p.arquivado, etapa: p.etapa, versao, dados: p, updated_at: '2026-11-17T10:00:00Z' })

function ctx(perfil: Perfil, db: unknown, brokerId: string | null = null): CtxVendas {
  return {
    membro: { userId: 'u-1', tenantId: TENANT, nome: 'Fulana Teste', brokerId },
    matriz: matrizPadrao(),
    sessao: { perfil, nome: 'Fulana Teste', corretorId: brokerId },
    db: db as CtxVendas['db'],
  }
}

const deps = (): DepsVendas & { registrarEvento: ReturnType<typeof vi.fn> } => ({ registrarEvento: vi.fn(async () => {}), comissaoPadrao: async () => 6 })

const rodar = (c: CtxVendas, acao: string, dados: unknown = {}, versao = 1) => executarAcaoVenda(c, ID, { versao, acao, dados }, deps())
const ADIANTAMENTO = { resp: 'imob', valor: 10, data: '2026-11-01' }

const gravado = (calls: ReturnType<typeof fakeSupabase>['calls']) => (calls.find((c) => c.method === 'update')!.args[0] as { dados: Processo }).dados

describe('o corretor enxerga e edita o financeiro do PRÓPRIO processo', () => {
  test('lê pct, adiantamentos e fin do próprio; do colega não vê nada (e o do colega nem chega: 404)', async () => {
    const a = fakeSupabase({ gestao_vendas: { data: row(processo(CORRETOR_A, { analiseFin: { status: 'rascunho' } })), error: null } })
    const r = await lerVendaDoMembro(ctx('corretor', a.client, CORRETOR_A), ID)
    expect(r.processo).toHaveProperty('pct')
    expect(r.processo).toHaveProperty('adiantamentos')
    expect(r.processo).toHaveProperty('fin')
    const b = fakeSupabase({ gestao_vendas: { data: null, error: null } })
    await expect(lerVendaDoMembro(ctx('corretor', b.client, CORRETOR_B), ID)).rejects.toMatchObject({ statusCode: 404 })
  })

  test('recorte POR PROCESSO: quem vê todos os processos mas não tem `financeiroLivre` (recepção) não recebe o financeiro nem o motivo da devolução', async () => {
    const p = processo(CORRETOR_A, { analiseFin: { status: 'devolvido', motivo: 'Comissão de R$ 20.000 está errada', enviadoPor: 'Carlos', decididoPor: 'Analista Fantasma' } })
    const { client } = fakeSupabase({ gestao_vendas: { data: row(p), error: null } })
    const r = await lerVendaDoMembro(ctx('recepcao', client), ID)
    const json = JSON.stringify(r)
    expect(r.processo).not.toHaveProperty('pct')
    expect(r.processo).not.toHaveProperty('adiantamentos')
    expect(r.processo).not.toHaveProperty('fin')
    expect(r.processo.analiseFin).toEqual({ status: 'devolvido' })
    expect(json).not.toContain('20.000')
    expect(json).not.toContain('Analista Fantasma')
  })

  test('financeiroLivre = proprio na LISTA: o do corretor vem inteiro, e um processo de outro corretor visto por perfil com verTodos mas financeiroLivre = proprio vem recortado', async () => {
    const c = ctx('recepcao', null as never)
    c.matriz.financeiroLivre.recepcao = 'proprio'
    const { client } = fakeSupabase({ gestao_vendas: { data: [row(processo(CORRETOR_A)), row(processo(CORRETOR_B, { id: 'V-2026-0143' }))], error: null } })
    c.db = client as CtxVendas['db']
    c.sessao = { perfil: 'recepcao', nome: 'Marina', corretorId: CORRETOR_A }
    const lista = await listarVendasDoMembro(c, { arquivados: false })
    const por = Object.fromEntries(lista.map((l) => [l.processo.id, l.processo]))
    expect(por[ID]).toHaveProperty('pct')
    expect(por['V-2026-0143']).not.toHaveProperty('pct')
  })

  test.each([
    ['registrarAdiantamento', ADIANTAMENTO],
    ['removerAdiantamento', { adiantamentoId: 'a1' }],
    ['marcarAdiantamentoPago', { adiantamentoId: 'a1', comprovante: 'x.pdf' }],
  ])('%s: o corretor do processo pode enquanto rascunho; o outro corretor não (404, nem enxerga)', async (acao, dados) => {
    const p = processo(CORRETOR_A, { analiseFin: { status: 'rascunho' } })
    const ok = fakeSupabase({ gestao_vendas: [{ data: row(p), error: null }, { data: [{ id: ID }], error: null }] })
    await expect(rodar(ctx('corretor', ok.client, CORRETOR_A), acao, dados)).resolves.toMatchObject({ versao: 2 })
    const fora = fakeSupabase({ gestao_vendas: { data: null, error: null } })
    await expect(rodar(ctx('corretor', fora.client, CORRETOR_B), acao, dados)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('depois de enviado, o corretor só lê', () => {
  test.each(['em-analise', 'aprovado'] as const)('em %s: adiantamento, financeiro e novo envio → 403 e nada é gravado', async (status) => {
    const p = processo(CORRETOR_A, { analiseFin: { status } })
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: row(p), error: null } })
    const c = ctx('corretor', client, CORRETOR_A)
    await expect(rodar(c, 'registrarAdiantamento', ADIANTAMENTO)).rejects.toMatchObject({ statusCode: 403 })
    await expect(rodar(c, 'removerAdiantamento', { adiantamentoId: 'a1' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(rodar(c, 'salvarFinanceiro', { valor: 1, fin: { forma: 'À vista', financiado: 0, fgts: 0, proprios: 0 } })).rejects.toMatchObject({ statusCode: 403 })
    await expect(rodar(c, 'enviarAnaliseFinanceira')).rejects.toMatchObject({ statusCode: 403 })
    expect(calls.some((x) => x.method === 'update')).toBe(false)
  })

  test('o corretor não aprova nem devolve a própria análise → 403', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: row(processo(CORRETOR_A, { analiseFin: { status: 'em-analise' } })), error: null } })
    const c = ctx('corretor', client, CORRETOR_A)
    await expect(rodar(c, 'aprovarAnaliseFinanceira')).rejects.toMatchObject({ statusCode: 403 })
    await expect(rodar(c, 'devolverAnaliseFinanceira', { motivo: 'x' })).rejects.toMatchObject({ statusCode: 403 })
    expect(calls.some((x) => x.method === 'update')).toBe(false)
  })

  test('devolvido volta a ser editável pelo corretor', async () => {
    const p = processo(CORRETOR_A, { analiseFin: { status: 'devolvido', motivo: 'corrigir' } })
    const { client } = fakeSupabase({ gestao_vendas: [{ data: row(p), error: null }, { data: [{ id: ID }], error: null }] })
    await expect(rodar(ctx('corretor', client, CORRETOR_A), 'registrarAdiantamento', ADIANTAMENTO)).resolves.toMatchObject({ versao: 2 })
  })
})

describe('transições da análise', () => {
  test('corretor envia: vira em-analise com quem e quando, e o histórico não cita valor', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: [{ data: row(processo(CORRETOR_A, { analiseFin: { status: 'rascunho' } })), error: null }, { data: [{ id: ID }], error: null }] })
    const d = deps()
    await executarAcaoVenda(ctx('corretor', client, CORRETOR_A), ID, { versao: 1, acao: 'enviarAnaliseFinanceira', dados: {} }, d)
    const g = gravado(calls)
    expect(g.analiseFin).toMatchObject({ status: 'em-analise', enviadoPor: 'Fulana Teste' })
    expect(g.hist[0]!.acao).toBe('Enviou o financeiro para análise')
    expect(d.registrarEvento).toHaveBeenCalledWith(client, TENANT, expect.objectContaining({ acao: 'venda.enviarAnaliseFinanceira' }))
  })

  test('não envia sem valor da venda (422)', async () => {
    const { client, calls } = fakeSupabase({ gestao_vendas: { data: row(processo(CORRETOR_A, { valor: 0, analiseFin: { status: 'rascunho' } })), error: null } })
    await expect(rodar(ctx('corretor', client, CORRETOR_A), 'enviarAnaliseFinanceira')).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Informe o valor da venda antes de enviar para análise.' })
    expect(calls.some((x) => x.method === 'update')).toBe(false)
  })

  test('jurídico devolve com motivo (obrigatório) e aprova; só do estado em-analise', async () => {
    const emAnalise = () => fakeSupabase({ gestao_vendas: [{ data: row(processo(CORRETOR_A, { analiseFin: { status: 'em-analise', enviadoPor: 'Carlos' } })), error: null }, { data: [{ id: ID }], error: null }] })
    const semMotivo = emAnalise()
    await expect(rodar(ctx('juridico', semMotivo.client), 'devolverAnaliseFinanceira', { motivo: '  ' })).rejects.toMatchObject({ statusCode: 422 })
    const dev = emAnalise()
    await rodar(ctx('juridico', dev.client), 'devolverAnaliseFinanceira', { motivo: 'Falta o adiantamento do captador' })
    expect(gravado(dev.calls).analiseFin).toMatchObject({ status: 'devolvido', motivo: 'Falta o adiantamento do captador', decididoPor: 'Fulana Teste' })
    const apr = emAnalise()
    await rodar(ctx('dono', apr.client), 'aprovarAnaliseFinanceira')
    expect(gravado(apr.calls).analiseFin).toMatchObject({ status: 'aprovado', enviadoPor: 'Carlos', decididoPor: 'Fulana Teste' })
    const rasc = fakeSupabase({ gestao_vendas: { data: row(processo(CORRETOR_A, { analiseFin: { status: 'rascunho' } })), error: null } })
    await expect(rodar(ctx('juridico', rasc.client), 'aprovarAnaliseFinanceira')).rejects.toMatchObject({ statusCode: 422 })
  })

  test('409 de versão vale para as ações novas', async () => {
    const { client } = fakeSupabase({ gestao_vendas: { data: row(processo(CORRETOR_A, { analiseFin: { status: 'em-analise' } }), 5), error: null } })
    await expect(rodar(ctx('juridico', client), 'aprovarAnaliseFinanceira', {}, 4)).rejects.toMatchObject({ statusCode: 409 })
  })

  test('jurídico e dono (valores) editam o financeiro mesmo em análise ou aprovado', async () => {
    const p = processo(CORRETOR_A, { analiseFin: { status: 'aprovado' } })
    const { client } = fakeSupabase({ gestao_vendas: [{ data: row(p), error: null }, { data: [{ id: ID }], error: null }] })
    await expect(rodar(ctx('juridico', client), 'registrarAdiantamento', ADIANTAMENTO)).resolves.toMatchObject({ versao: 2 })
  })

  test('finalização: encaminhar com o financeiro em análise é recusado; ausente (legado) não bloqueia', async () => {
    const conferencia = { documentacao: true, valores: true, comissao: true, encaminhado: true, responsavel: 'Marina', data: '2026-11-20' }
    const bloqueado = fakeSupabase({ gestao_vendas: { data: row(processo(CORRETOR_A, { analiseFin: { status: 'em-analise' } })), error: null } })
    await expect(rodar(ctx('recepcao', bloqueado.client), 'salvarConferenciaFinal', conferencia)).rejects.toMatchObject({ statusCode: 422, statusMessage: expect.stringContaining('não foi aprovado') })
    const legado = fakeSupabase({ gestao_vendas: [{ data: row(processo(CORRETOR_A)), error: null }, { data: [{ id: ID }], error: null }] })
    await expect(rodar(ctx('recepcao', legado.client), 'salvarConferenciaFinal', conferencia)).resolves.toMatchObject({ versao: 2 })
  })
})

describe('abertura do processo', () => {
  const IMOVEL = '11111111-1111-4111-8111-111111111111'
  const corpo = { imovel: 'Casa 12', imovelId: IMOVEL, vendedor: 'Maria', comprador: 'João' }
  const fila = (corretor: string) => fakeSupabase({
    brokers: { data: [{ id: corretor }], error: null },
    properties: { data: { id: IMOVEL }, error: null },
    gestao_vendas: [{ data: [], error: null }, { data: null, error: null }],
  })

  test('aberto por quem não tem `valores` nasce com o financeiro em rascunho; por quem tem, sem análise', async () => {
    const a = fila(CORRETOR_A)
    const r = await abrirVendaDoMembro(ctx('corretor', a.client, CORRETOR_A), corpo, deps())
    expect(r.processo.analiseFin).toEqual({ status: 'rascunho' })
    const juridico = fakeSupabase({ brokers: { data: [{ id: CORRETOR_A }], error: null }, properties: { data: { id: IMOVEL }, error: null }, gestao_vendas: [{ data: [], error: null }, { data: null, error: null }] })
    const j = await abrirVendaDoMembro(ctx('juridico', juridico.client), { ...corpo, corretorId: CORRETOR_A }, deps())
    expect(j.processo.analiseFin).toBeUndefined()
  })
})

describe('matriz já gravada antes da permissão existir', () => {
  test('matriz salva sem `financeiroLivre` recebe o padrão (nada além dele)', () => {
    const salva = matrizPadrao() as Record<string, unknown>
    delete salva.financeiroLivre
    const m = matrizDoBanco(salva)
    expect(m.financeiroLivre).toEqual({ corretor: 'proprio', recepcao: 'nao', juridico: 'sim', dono: 'sim' })
  })

  test('o Dono pode tirar `financeiroLivre` do corretor: aí ele nem vê o financeiro', async () => {
    const p = processo(CORRETOR_A, { analiseFin: { status: 'rascunho' } })
    const { client } = fakeSupabase({ gestao_vendas: { data: row(p), error: null } })
    const c = ctx('corretor', client, CORRETOR_A)
    c.matriz.financeiroLivre.corretor = 'nao'
    const r = await lerVendaDoMembro(c, ID)
    expect(r.processo).not.toHaveProperty('pct')
  })

  test('aba antiga que manda a matriz sem a linha nova não é recusada; com a linha incompleta, sim', () => {
    const antiga = matrizPadrao() as Record<string, unknown>
    delete antiga.financeiroLivre
    expect(validarMatrizPedido(antiga)).toMatchObject({ ok: true })
    const quebrada = { ...matrizPadrao(), financeiroLivre: { corretor: 'proprio' } }
    expect(validarMatrizPedido(quebrada)).toMatchObject({ ok: false })
  })
})
