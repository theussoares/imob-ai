import { describe, expect, test } from 'vitest'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import type { AnaliseFinanceira, Locacao, Perfil } from '~~/layers/gestao/domain/types'
import { toLocacaoRow } from '~~/server/mappers/gestao-locacao'
import { abrir, agir, ler } from '~~/server/utils/gestao-locacao-servico'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * Financeiro livre com análise na locação: o corretor preenche o CONTRATO (valor do aluguel e taxa) da própria
 * locação, que só vale depois de aprovado por quem tem `valores`. Cobranças, pagamentos e repasses seguem só de
 * `valores`. Cada teste nomeia a ameaça.
 */

const T = 'tenant-1'
const BROKER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BROKER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const IMOVEL = '22222222-2222-4222-8222-222222222222'
const ID = 'L-2026-0001'
const CONTRATO = { valor: 3200, diaVencimento: 10, inicio: '2026-01-01', fim: '2027-01-01', reajuste: 'IGP-M' as const, taxaPct: 8 }

function locacao(analiseFin?: AnaliseFinanceira, over: Partial<Locacao> = {}): Locacao {
  const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador: 'Ana', locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1', corretorId: BROKER_A }, { nome: 'C' }, '17/11/2026 10:00')
  if (!r.ok) throw new Error(r.erro)
  return {
    ...r.estado.locacoes[0]!, etapa: 7, concluidas: [true, true, true, true, true, true, false, false], status: 'Contrato e aluguel',
    contrato: CONTRATO,
    cobrancas: [{ id: 'cb-2026-10', competencia: '2026-10', valor: 3200, vencimento: '2026-10-10', repasse: { valor: 2944, feito: false } }],
    ...(analiseFin && { analiseFin }),
    ...over,
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

const status = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as { statusCode?: number; statusMessage?: string } | null)
const corpo = (acao: string, dados: unknown = {}, versao = 1) => ({ acao, dados, versao })
const lido = (l: Locacao) => ({ gestao_locacoes: { data: linha(l), error: null } })
const lidoEGravado = (l: Locacao) => ({ gestao_locacoes: [{ data: linha(l), error: null }, { data: [{ id: ID }], error: null }] })
const gravado = (calls: { method: string; args: unknown[] }[]) => (calls.find((x) => x.method === 'update')!.args[0] as { dados: Locacao }).dados

describe('o corretor da locação preenche o contrato enquanto a análise não foi enviada', () => {
  test('em rascunho e devolvido salva o contrato; em análise e aprovado → 403 e nada gravado', async () => {
    for (const status_ of ['rascunho', 'devolvido'] as const) {
      const { c, calls } = ctx('corretor', BROKER_A, lidoEGravado(locacao({ status: status_ })))
      await expect(agir(c, ID, corpo('salvarContrato', { ...CONTRATO, valor: 3500 }))).resolves.toMatchObject({ versao: 2 })
      expect(gravado(calls).contrato?.valor).toBe(3500)
    }
    for (const status_ of ['em-analise', 'aprovado'] as const) {
      const { c, calls } = ctx('corretor', BROKER_A, lido(locacao({ status: status_ })))
      expect((await status(agir(c, ID, corpo('salvarContrato', CONTRATO))))?.statusCode).toBe(403)
      expect(calls.some((x) => x.method === 'update')).toBe(false)
    }
  })

  test('o contrato de outro corretor é 404 (nem enxerga); recepção sem financeiroLivre é 403 antes do banco', async () => {
    const b = ctx('corretor', BROKER_B, { gestao_locacoes: { data: null, error: null } })
    expect((await status(agir(b.c, ID, corpo('salvarContrato', CONTRATO))))?.statusCode).toBe(404)
    const r = ctx('recepcao', null, {})
    expect((await status(agir(r.c, ID, corpo('salvarContrato', CONTRATO))))?.statusCode).toBe(403)
    expect(r.calls).toHaveLength(0)
  })

  test('cobranças, pagamentos e repasses seguem só de `valores`: o corretor leva 403', async () => {
    const { c } = ctx('corretor', BROKER_A, {})
    for (const [acao, dados] of [['gerarCobranca', { competencia: '2026-11' }], ['registrarPagamento', { cobrancaId: 'cb-2026-10', valor: 1, data: '2026-11-01', forma: 'PIX' }]] as const) {
      expect((await status(agir(c, ID, corpo(acao, dados))))?.statusCode).toBe(403)
    }
  })
})

describe('transições', () => {
  test('corretor envia (precisa do valor do aluguel); não aprova nem devolve a própria análise', async () => {
    const { c, calls } = ctx('corretor', BROKER_A, lidoEGravado(locacao({ status: 'rascunho' })))
    await agir(c, ID, corpo('enviarAnaliseFinanceira'))
    expect(gravado(calls).analiseFin).toMatchObject({ status: 'em-analise', enviadoPor: 'Fulano' })
    const sem = ctx('corretor', BROKER_A, lido(locacao({ status: 'rascunho' }, { contrato: undefined })))
    expect(await status(agir(sem.c, ID, corpo('enviarAnaliseFinanceira')))).toMatchObject({ statusCode: 422, statusMessage: 'Salve o valor do aluguel no contrato antes de enviar para análise.' })
    for (const acao of ['aprovarAnaliseFinanceira', 'devolverAnaliseFinanceira']) {
      const x = ctx('corretor', BROKER_A, {})
      expect((await status(agir(x.c, ID, corpo(acao, { motivo: 'x' }))))?.statusCode).toBe(403)
      expect(x.calls).toHaveLength(0)
    }
  })

  test('jurídico devolve com motivo e aprova; só do estado em-analise', async () => {
    const dev = ctx('juridico', null, lidoEGravado(locacao({ status: 'em-analise', enviadoPor: 'Carlos' })))
    await agir(dev.c, ID, corpo('devolverAnaliseFinanceira', { motivo: 'Taxa errada' }))
    expect(gravado(dev.calls).analiseFin).toMatchObject({ status: 'devolvido', motivo: 'Taxa errada' })
    const sem = ctx('juridico', null, lido(locacao({ status: 'em-analise' })))
    expect((await status(agir(sem.c, ID, corpo('devolverAnaliseFinanceira', { motivo: ' ' }))))?.statusCode).toBe(422)
    const apr = ctx('dono', null, lidoEGravado(locacao({ status: 'em-analise', enviadoPor: 'Carlos' })))
    await agir(apr.c, ID, corpo('aprovarAnaliseFinanceira'))
    expect(gravado(apr.calls).analiseFin).toMatchObject({ status: 'aprovado', enviadoPor: 'Carlos' })
    const rasc = ctx('juridico', null, lido(locacao({ status: 'rascunho' })))
    expect((await status(agir(rasc.c, ID, corpo('aprovarAnaliseFinanceira'))))?.statusCode).toBe(422)
  })

  test('concluir a etapa 7 só com a análise aprovada; locação sem análise (legado) não bloqueia', async () => {
    const em = ctx('juridico', null, lido(locacao({ status: 'em-analise' })))
    expect(await status(agir(em.c, ID, corpo('concluirEtapaLocacao', { etapa: 7 })))).toMatchObject({ statusCode: 422, statusMessage: expect.stringContaining('não foi aprovado') })
    const legado = ctx('juridico', null, lidoEGravado(locacao()))
    await expect(agir(legado.c, ID, corpo('concluirEtapaLocacao', { etapa: 7 }))).resolves.toMatchObject({ versao: 2 })
  })

  test('409 de versão vale para as ações novas', async () => {
    const { c } = ctx('juridico', null, { gestao_locacoes: { data: linha(locacao({ status: 'em-analise' }), 5), error: null } })
    expect((await status(agir(c, ID, corpo('aprovarAnaliseFinanceira', {}, 4))))?.statusCode).toBe(409)
  })
})

describe('recorte por locação', () => {
  test('corretor da locação vê o contrato (valor e taxa), mas não cobranças, pagamentos nem repasses', async () => {
    const { c } = ctx('corretor', BROKER_A, lido(locacao({ status: 'rascunho' })))
    const r = (await ler(c, ID)).locacao as Locacao
    expect(r.contrato).toMatchObject({ valor: 3200, taxaPct: 8 })
    const json = JSON.stringify(r.cobrancas)
    expect(json).not.toContain('3200')
    expect(json).not.toContain('2944')
    expect(r.analiseFin).toEqual({ status: 'rascunho' })
  })

  test('recepção não vê valor, taxa nem o motivo da devolução, só o estado', async () => {
    const { c } = ctx('recepcao', null, lido(locacao({ status: 'devolvido', motivo: 'Taxa de 12% errada', decididoPor: 'Analista Fantasma' })))
    const r = (await ler(c, ID)).locacao as Locacao
    const json = JSON.stringify(r)
    expect(r.contrato).not.toHaveProperty('valor')
    expect(r.contrato).not.toHaveProperty('taxaPct')
    expect(r.analiseFin).toEqual({ status: 'devolvido' })
    expect(json).not.toContain('12%')
    expect(json).not.toContain('Analista Fantasma')
  })

  test('com `financeiroLivre` tirado do corretor pelo Dono, ele volta a não ver o contrato', async () => {
    const { c } = ctx('corretor', BROKER_A, lido(locacao({ status: 'rascunho' })))
    ;(c as { matriz: Record<string, Record<string, string>> }).matriz.financeiroLivre!.corretor = 'nao'
    const r = (await ler(c, ID)).locacao as Locacao
    expect(r.contrato).not.toHaveProperty('valor')
  })
})

describe('abertura', () => {
  const body = { locador: 'Ana', locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1' }
  const fila = () => ({ properties: { data: { id: IMOVEL }, error: null }, gestao_locacoes: [{ data: [], error: null }, { data: null, error: null }] })

  test('aberta por quem não tem `valores` nasce com o contrato em rascunho; por quem tem, sem análise', async () => {
    const corretor = ctx('corretor', BROKER_A, fila())
    expect(((await abrir(corretor.c, body)).locacao as Locacao).analiseFin).toEqual({ status: 'rascunho' })
    const dono = ctx('dono', null, { ...fila(), brokers: { data: { id: BROKER_A }, error: null } })
    expect(((await abrir(dono.c, { ...body, corretorId: BROKER_A })).locacao as Locacao).analiseFin).toBeUndefined()
  })
})
