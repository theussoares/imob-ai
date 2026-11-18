import { describe, expect, test, vi } from 'vitest'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import type { Locacao, Perfil } from '~~/layers/gestao/domain/types'
import { toLocacaoRow } from '~~/server/mappers/gestao-locacao'
import { fakeSupabase, type RecordedCall } from '../helpers/fake-supabase'

/**
 * Sem `vi.mock`: o serviço roda sobre a F1 (`exigirPermissao`, `registrarEvento`) e a F2
 * (`executarAcao`) de verdade. Os dublês antigos existiam só porque as fases viviam em
 * branches separadas; um mock que repete o contrato esconde justamente a divergência
 * que a integração precisa pegar.
 */
import { abrir, agir, ler, listar } from '~~/server/utils/gestao-locacao-servico'

const T = 'tenant-1'
const BROKER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BROKER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const IMOVEL = '22222222-2222-4222-8222-222222222222'

function locacao(corretorId = BROKER_A): Locacao {
  const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador: 'Ana', locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1', corretorId }, { nome: 'C' }, '17/11/2026 10:00')
  if (!r.ok) throw new Error(r.erro)
  return r.estado.locacoes[0]!
}

function ativa(): Locacao {
  return {
    ...locacao(),
    status: 'Ativa',
    etapa: 8,
    concluidas: [true, true, true, true, true, true, true, false],
    contrato: { valor: 3200, diaVencimento: 10, inicio: '2026-01-01', fim: '2027-01-01', reajuste: 'IGP-M', taxaPct: 8 },
    cobrancas: [{ id: 'cb-2026-10', competencia: '2026-10', valor: 3200, vencimento: '2026-10-10', pago: { data: '2026-10-09', comprovante: 'pix.pdf' }, repasse: { valor: 2944, feito: false } }],
  }
}

const linha = (l: Locacao, versao = 1) => ({ ...toLocacaoRow(l, T), versao, updated_at: '2026-11-17T10:00:00Z' })

function ctx(perfil: Perfil, brokerId: string | null, results: Parameters<typeof fakeSupabase>[0]) {
  const { client, calls } = fakeSupabase(results)
  const c = {
    membro: { id: 'm1', userId: 'u1', tenantId: T, nome: 'Fulano', perfil, brokerId },
    tenant: { id: T },
    sessao: { perfil, nome: 'Fulano', corretorId: brokerId },
    matriz: matrizPadrao(),
    db: client,
  } as never
  return { c, calls }
}

const eqs = (calls: RecordedCall[], col: string) => calls.filter((x) => x.method === 'eq' && x.args[0] === col).map((x) => x.args[1])
const status = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as { statusCode?: number; statusMessage?: string } | null)

/** Inserts em `gestao_eventos`: o que o serviço auditou. */
const eventos = (calls: RecordedCall[]) => calls.filter((x) => x.table === 'gestao_eventos' && x.method === 'insert').map((x) => x.args[0])

describe('leitura: escopo, 404 e recorte', () => {
  test('corretor B pede a locação do corretor A pelo id: 404, e a query foi escopada por corretor', async () => {
    const { c, calls } = ctx('corretor', BROKER_B, { gestao_locacoes: { data: null, error: null } })
    const e = await status(ler(c, 'L-2026-0001'))
    expect(e?.statusCode).toBe(404)
    expect(eqs(calls, 'corretor_id')).toEqual([BROKER_B])
    expect(eqs(calls, 'tenant_id')).toEqual([T])
  })

  test('id fora do formato é 404 sem tocar no banco', async () => {
    const { c, calls } = ctx('dono', null, {})
    expect((await status(ler(c, "L-1'; drop"))).statusCode).toBe(404)
    expect(calls).toHaveLength(0)
  })

  test('recepção/dono veem todas: sem filtro de corretor, mas sempre de tenant', async () => {
    const { c, calls } = ctx('recepcao', null, { gestao_locacoes: { data: [linha(locacao())], error: null } })
    await listar(c, false)
    expect(eqs(calls, 'corretor_id')).toEqual([])
    expect(eqs(calls, 'tenant_id')).toEqual([T])
  })

  test('sem «valores» a resposta não carrega valor, taxa, repasse nem comprovante', async () => {
    const { c } = ctx('recepcao', null, { gestao_locacoes: { data: linha(ativa()), error: null } })
    const r = await ler(c, 'L-2026-0001')
    const json = JSON.stringify(r)
    for (const x of ['3200', '2944', 'taxaPct', 'comprovante', 'pix.pdf']) expect(json).not.toContain(x)
  })

  test('com «valores» a resposta traz os números', async () => {
    const { c } = ctx('juridico', null, { gestao_locacoes: { data: linha(ativa()), error: null } })
    expect(JSON.stringify(await ler(c, 'L-2026-0001'))).toContain('3200')
  })

  test('arquivados: lista exige poder arquivar; id de arquivada some para quem não vê arquivados', async () => {
    const a = ctx('corretor', BROKER_A, {})
    expect((await status(listar(a.c, true))).statusCode).toBe(403)
    const arq = { ...locacao(), arquivado: true, status: 'Encerrada' as const }
    const b = ctx('corretor', BROKER_A, { gestao_locacoes: { data: linha(arq), error: null } })
    expect((await status(ler(b.c, arq.id))).statusCode).toBe(404)
  })
})

describe('ações: permissão, versão e 409', () => {
  const corpo = (acao: string, dados: unknown, versao = 1) => ({ acao, dados, versao })

  test('recepção não registra pagamento: 403 antes de tocar no banco', async () => {
    const { c, calls } = ctx('recepcao', null, {})
    const e = await status(agir(c, 'L-2026-0001', corpo('registrarPagamento', { cobrancaId: 'cb-2026-10', data: '2026-11-01', comprovante: 'a.pdf' })))
    expect(e?.statusCode).toBe(403)
    expect(calls).toHaveLength(0)
  })

  test('ação desconhecida e chave de protótipo: 422', async () => {
    const { c } = ctx('dono', null, {})
    expect((await status(agir(c, 'L-2026-0001', corpo('apagarTudo', {})))).statusCode).toBe(422)
    expect((await status(agir(c, 'L-2026-0001', corpo('__proto__', {})))).statusCode).toBe(422)
    expect((await status(agir(c, 'L-2026-0001', { acao: 'arquivarLocacao' })))?.statusCode).toBe(422) // sem versao
  })

  test('aba defasada: versão diferente da gravada = 409, e nada é gravado', async () => {
    const { c, calls } = ctx('juridico', null, { gestao_locacoes: { data: linha(ativa(), 5), error: null } })
    const e = await status(agir(c, 'L-2026-0001', corpo('renovarLocacao', {}, 4)))
    expect(e).toMatchObject({ statusCode: 409, statusMessage: 'Esta locação foi alterada por outra pessoa. Recarregue.' })
    expect(calls.some((x) => x.method === 'update')).toBe(false)
    expect(eventos(calls)).toEqual([])
  })

  test('corrida: versão confere ao ler mas o update não acha linha = 409', async () => {
    const { c } = ctx('juridico', null, { gestao_locacoes: [{ data: linha(ativa(), 5), error: null }, { data: [], error: null }] })
    expect((await status(agir(c, 'L-2026-0001', corpo('renovarLocacao', {}, 5)))).statusCode).toBe(409)
  })

  test('caminho feliz: grava com versão+1, escopo de tenant, evento e resposta com nova versão', async () => {
    const { c, calls } = ctx('juridico', null, { gestao_locacoes: [{ data: linha(ativa(), 5), error: null }, { data: [{ id: 'L-2026-0001' }], error: null }] })
    const r = await agir(c, 'L-2026-0001', corpo('renovarLocacao', {}, 5))
    expect(r.versao).toBe(6)
    expect((calls.find((x) => x.method === 'update')!.args[0] as { versao: number }).versao).toBe(6)
    expect(eqs(calls, 'tenant_id')).toEqual([T, T])
    expect(eventos(calls)).toEqual([{ tenant_id: T, ator_user_id: 'u1', ator_nome: 'Fulano', acao: 'renovarLocacao', alvo_tipo: 'locacao', alvo_id: 'L-2026-0001' }])
    expect(JSON.stringify(r.locacao)).toContain('2028-01-01') // renovou 12 meses
  })

  test('regra de domínio recusa: 422 com a frase do domínio, sem gravar', async () => {
    const { c, calls } = ctx('dono', null, { gestao_locacoes: { data: linha(locacao(), 1), error: null } })
    const e = await status(agir(c, 'L-2026-0001', corpo('renovarLocacao', {}, 1)))
    expect(e).toMatchObject({ statusCode: 422, statusMessage: 'Só locação ativa pode ser renovada.' })
    expect(calls.some((x) => x.method === 'update')).toBe(false)
  })

  test('falha ao registrar o evento não derruba uma ação já gravada', async () => {
    const { c } = ctx('juridico', null, {
      gestao_locacoes: [{ data: linha(ativa(), 1), error: null }, { data: [{ id: 'x' }], error: null }],
      gestao_eventos: { data: null, error: { message: 'boom' } },
    })
    await expect(agir(c, 'L-2026-0001', corpo('renovarLocacao', {}, 1))).resolves.toBeTruthy()
  })

  test('corretor editando locação de outro (verTodos=sim, editar=proprio): 403 e nada gravado', async () => {
    const { c, calls } = ctx('corretor', BROKER_B, { gestao_locacoes: { data: linha(locacao(BROKER_A), 1), error: null } })
    ;(c as { matriz: Record<string, Record<string, string>> }).matriz.verTodos!.corretor = 'sim'
    const e = await status(agir(c, 'L-2026-0001', corpo('salvarGarantia', { tipo: 'Caução', detalhe: 'x' })))
    expect(e?.statusCode).toBe(403)
    expect(calls.some((x) => x.method === 'update')).toBe(false)
  })

  test('sem permissão sobre a locação e com versão velha: 403 (a permissão decide antes do 409, que confirmaria a existência)', async () => {
    const { c, calls } = ctx('corretor', BROKER_B, { gestao_locacoes: { data: linha(locacao(BROKER_A), 5), error: null } })
    ;(c as { matriz: Record<string, Record<string, string>> }).matriz.verTodos!.corretor = 'sim'
    const e = await status(agir(c, 'L-2026-0001', corpo('salvarGarantia', { tipo: 'Caução', detalhe: 'x' }, 4)))
    expect(e?.statusCode).toBe(403)
    expect(calls.some((x) => x.method === 'update')).toBe(false)
  })

  test('corretor de outra locação sem verTodos: 404 (não vaza existência)', async () => {
    const { c } = ctx('corretor', BROKER_B, { gestao_locacoes: { data: null, error: null } })
    expect((await status(agir(c, 'L-2026-0001', corpo('salvarGarantia', { tipo: 'Caução', detalhe: 'x' })))).statusCode).toBe(404)
  })

  test('concluir etapa lê os documentos do próprio tenant e alvo', async () => {
    const { c, calls } = ctx('dono', null, {
      gestao_locacoes: { data: linha({ ...locacao(), etapa: 2 }, 1), error: null },
      gestao_documentos: { data: [], error: null },
    })
    const e = await status(agir(c, 'L-2026-0001', corpo('concluirEtapaLocacao', { etapa: 2 })))
    expect(e?.statusCode).toBe(422) // faltam CPF e documentos
    const docs = calls.filter((x) => x.table === 'gestao_documentos' && x.method === 'eq')
    expect(docs.map((x) => x.args)).toEqual([['tenant_id', T], ['alvo_tipo', 'locacao'], ['alvo_id', 'L-2026-0001']])
  })

  test('reatribuir corretor: o corretor não consegue; o dono só para corretor do próprio tenant', async () => {
    const dados = { locador: { nome: 'Ana', cpf: '' }, locatario: { nome: 'Bruno', cpf: '' }, imovelId: IMOVEL, imovel: 'Casa 1', corretorId: BROKER_B }
    const a = ctx('corretor', BROKER_A, { gestao_locacoes: [{ data: linha(locacao(BROKER_A), 1), error: null }, { data: [{ id: 'x' }], error: null }] })
    const r = await agir(a.c, 'L-2026-0001', corpo('salvarAberturaLocacao', dados))
    expect((r.locacao as Locacao).corretorId).toBe(BROKER_A)
    expect(a.calls.filter((x) => x.table === 'brokers')).toHaveLength(0)

    const d = ctx('dono', null, { gestao_locacoes: { data: linha(locacao(BROKER_A), 1), error: null }, brokers: { data: null, error: null } })
    expect((await status(agir(d.c, 'L-2026-0001', corpo('salvarAberturaLocacao', dados)))).statusCode).toBe(422)
    expect(eqs(d.calls.filter((x) => x.table === 'brokers'), 'tenant_id')).toEqual([T])
  })
})

describe('abrir', () => {
  const body = { locador: 'Ana', locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1' }

  test('corretor abre em nome próprio: o corretorId do corpo é ignorado', async () => {
    const { c, calls } = ctx('corretor', BROKER_A, {
      properties: { data: { id: IMOVEL }, error: null },
      gestao_locacoes: [{ data: [], error: null }, { data: null, error: null }],
    })
    const r = await abrir(c, { ...body, corretorId: BROKER_B, tenantId: 'outro' })
    expect((r.locacao as Locacao).corretorId).toBe(BROKER_A)
    const ins = calls.find((x) => x.method === 'insert')!.args[0] as { tenant_id: string; corretor_id: string; versao: number }
    expect(ins).toMatchObject({ tenant_id: T, corretor_id: BROKER_A, versao: 1 })
    expect(eventos(calls)).toHaveLength(1)
  })

  test('quem não vê todos (matriz, não o nome do perfil) abre sempre em nome do próprio corretor', async () => {
    const { c, calls } = ctx('recepcao', BROKER_A, {
      properties: { data: { id: IMOVEL }, error: null },
      gestao_locacoes: [{ data: [], error: null }, { data: null, error: null }],
    })
    ;(c as { matriz: Record<string, Record<string, string>> }).matriz.verTodos!.recepcao = 'proprio'
    const r = await abrir(c, { ...body, corretorId: BROKER_B })
    expect((r.locacao as Locacao).corretorId).toBe(BROKER_A)
    expect((calls.find((x) => x.method === 'insert')!.args[0] as { corretor_id: string }).corretor_id).toBe(BROKER_A)
  })

  test('imóvel de outro tenant: 422, nada inserido', async () => {
    const { c, calls } = ctx('corretor', BROKER_A, { properties: { data: null, error: null } })
    expect((await status(abrir(c, body))).statusCode).toBe(422)
    expect(eqs(calls.filter((x) => x.table === 'properties'), 'tenant_id')).toEqual([T])
    expect(calls.some((x) => x.method === 'insert')).toBe(false)
  })

  test('perfil sem «criar» não abre; dono precisa informar corretor do tenant', async () => {
    const m = ctx('recepcao', null, {})
    ;(m.c as { matriz: Record<string, Record<string, string>> }).matriz.criar!.recepcao = 'nao'
    expect((await status(abrir(m.c, body))).statusCode).toBe(403)
    const d = ctx('dono', null, { brokers: { data: null, error: null } })
    expect((await status(abrir(d.c, { ...body, corretorId: BROKER_B }))).statusCode).toBe(422)
  })

  test('número tomado por outro request: tenta de novo; esgotado, 409', async () => {
    const dup = { data: null, error: { code: '23505' } }
    const ok = ctx('corretor', BROKER_A, {
      properties: { data: { id: IMOVEL }, error: null },
      gestao_locacoes: [{ data: [], error: null }, dup, { data: [{ id: 'L-2026-0001' }], error: null }, { data: null, error: null }],
    })
    expect((await abrir(ok.c, body)).versao).toBe(1)

    const ruim = ctx('corretor', BROKER_A, {
      properties: { data: { id: IMOVEL }, error: null },
      gestao_locacoes: [{ data: [], error: null }, dup, { data: [], error: null }, dup, { data: [], error: null }, dup],
    })
    expect((await status(abrir(ruim.c, body))).statusCode).toBe(409)
  })
})
