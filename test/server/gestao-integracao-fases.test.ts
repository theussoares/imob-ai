import { describe, expect, test } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import type { Perfil, Processo } from '~~/layers/gestao/domain/types'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { toLocacaoRow } from '~~/server/mappers/gestao-locacao'
import { listarDocumentosDoAlvo } from '~~/server/repositories/gestao-documento.repository'
import { locacoesAtivasDoImovel } from '~~/server/repositories/gestao-locacao.repository'
import { executarAcaoVenda, type CtxVendas } from '~~/server/utils/gestao-vendas'
import { memoriaSupabase } from '../helpers/memoria-supabase'

/**
 * Costuras entre fases, SEM `vi.mock` e sem dublê de repository: cada fase roda sobre o
 * repository real da vizinha, com um banco em memória que de fato filtra por tenant.
 * Os testes por fase só provam que cada uma cumpre o contrato do plano; aqui se prova
 * que os contratos, juntos, dão o comportamento prometido.
 */

const TA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CORRETOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const IMOVEL = '22222222-2222-4222-8222-222222222222'
const ID = 'V-2026-0142'

const processo = (): Processo => ({
  ...processosSeed().find((p) => p.id === ID)!,
  corretorId: CORRETOR,
  captadorId: CORRETOR,
  status: 'Em negociação',
  etapa: 2,
  concluidas: [true, false, false, false, false, false, false, false],
  arquivado: false,
})
const venda = (p: Processo, tenant = TA) => ({ id: p.id, tenant_id: tenant, corretor_id: p.corretorId, status: p.status, arquivado: p.arquivado, etapa: p.etapa, versao: 1, dados: p, updated_at: '2026-11-17T10:00:00Z' })
const doc = (requisito: string, over: Record<string, unknown> = {}) => ({
  tenant_id: TA, alvo_tipo: 'venda', alvo_id: ID, requisito, nome: `${requisito}.pdf`, categoria: 'pessoas', estado: 'enviado',
  tamanho: 10, versao: 1, mime: 'application/pdf', storage_path: `x/${requisito}`, enviado_por: 'Ana', apagado_por: null, apagado_em: null, ...over,
})
const REQ_ETAPA_2 = ['vendedor:rg-cnh', 'vendedor:certidao', 'vendedor:residencia']

function ctxVendas(db: unknown, perfil: Perfil = 'dono'): CtxVendas {
  return {
    membro: { userId: 'u-1', tenantId: TA, nome: 'Fulana', brokerId: null },
    matriz: matrizPadrao(),
    sessao: { perfil, nome: 'Fulana', corretorId: null },
    db: db as CtxVendas['db'],
  }
}
const deps = (db: unknown) => ({
  registrarEvento: async () => {},
  comissaoPadrao: async () => 6,
  documentosDoProcesso: (d: typeof db, t: string, id: string) => listarDocumentosDoAlvo(d as never, t, { tipo: 'venda', id }),
})
const concluir = (m: ReturnType<typeof memoriaSupabase>) => executarAcaoVenda(ctxVendas(m.db), ID, { acao: 'concluirEtapa', dados: { etapa: 2 } }, deps(m.db) as never)

describe('F2 × F3: checklist da venda lê o documento de verdade', () => {
  test('três documentos enviados do processo: a etapa 2 conclui', async () => {
    const m = memoriaSupabase({ gestao_vendas: [venda(processo())], gestao_documentos: REQ_ETAPA_2.map((r) => doc(r)) })
    await expect(concluir(m)).resolves.toMatchObject({ versao: 2 })
  })

  test('upload não confirmado (pendente) não vale como arquivo', async () => {
    const m = memoriaSupabase({
      gestao_vendas: [venda(processo())],
      gestao_documentos: [doc(REQ_ETAPA_2[0]!), doc(REQ_ETAPA_2[1]!), doc(REQ_ETAPA_2[2]!, { estado: 'pendente' })],
    })
    await expect(concluir(m)).rejects.toMatchObject({ statusCode: 422 })
  })

  test('documento na lixeira reabre a pendência', async () => {
    const m = memoriaSupabase({
      gestao_vendas: [venda(processo())],
      gestao_documentos: [doc(REQ_ETAPA_2[0]!), doc(REQ_ETAPA_2[1]!), doc(REQ_ETAPA_2[2]!, { apagado_em: '2026-11-16T10:00:00Z', apagado_por: 'Ana' })],
    })
    await expect(concluir(m)).rejects.toMatchObject({ statusCode: 422 })
  })

  test('documento de outro tenant com o mesmo alvo não cumpre o requisito', async () => {
    const m = memoriaSupabase({
      gestao_vendas: [venda(processo())],
      gestao_documentos: REQ_ETAPA_2.map((r) => doc(r, { tenant_id: TB })),
    })
    await expect(concluir(m)).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('F5 × F4: imóvel com locação em andamento', () => {
  const locacao = (over: Record<string, unknown> = {}) => {
    const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador: 'Ana', locatario: 'Bruno', imovelId: IMOVEL, imovel: 'Casa 1', corretorId: CORRETOR }, { nome: 'C' }, '17/11/2026 10:00')
    if (!r.ok) throw new Error(r.erro)
    return { ...toLocacaoRow(r.estado.locacoes[0]!, TA), versao: 1, updated_at: '2026-11-17T10:00:00Z', ...over }
  }
  const quais = async (linhas: Record<string, unknown>[], tenant = TA) =>
    (await locacoesAtivasDoImovel(memoriaSupabase({ gestao_locacoes: linhas }).db, tenant, IMOVEL)).length

  test('em andamento bloqueia; encerrada, arquivada, de outro imóvel e de outro tenant não', async () => {
    expect(await quais([locacao()])).toBe(1)
    expect(await quais([locacao({ status: 'Encerrada' })])).toBe(0)
    expect(await quais([locacao({ arquivado: true })])).toBe(0)
    expect(await quais([locacao({ imovel_id: '33333333-3333-4333-8333-333333333333' })])).toBe(0)
    expect(await quais([locacao({ tenant_id: TB })])).toBe(0)
  })
})
