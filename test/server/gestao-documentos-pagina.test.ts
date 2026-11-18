import { describe, expect, test } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import type { Perfil, Processo } from '~~/layers/gestao/domain/types'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { toLocacaoRow } from '~~/server/mappers/gestao-locacao'
import { paginaDeDocumentos, type FiltroPaginaDocumentos } from '~~/server/utils/gestao-documentos-pagina'
import { memoriaSupabase } from '../helpers/memoria-supabase'

/**
 * Tela Documentos paginada. O que ela não pode fazer: mostrar documento de processo que o membro
 * não vê, de outro tenant ou pendente; esconder o corte; nem vazar a lixeira a quem não apaga.
 */

const T = '11111111-1111-4111-8111-111111111111'
const OUTRO = '99999999-9999-4999-8999-999999999999'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function venda(corretorId: string, id: string, over: Partial<Processo> = {}, tenant = T) {
  const base = processosSeed().find((p) => p.id === 'V-2026-0142')!
  const p: Processo = { ...base, id, corretorId, captadorId: corretorId, status: 'Em negociação', arquivado: false, pdf: false, imovel: `Imóvel ${id}`, ...over }
  return { id, tenant_id: tenant, corretor_id: corretorId, status: p.status, arquivado: p.arquivado, etapa: p.etapa, versao: 1, dados: p, updated_at: '2026-11-17T10:00:00Z' }
}

let n = 0
function doc(alvo: string, over: Record<string, unknown> = {}, tenant = T) {
  n += 1
  return {
    id: `d${n}`, tenant_id: tenant, alvo_tipo: 'venda', alvo_id: alvo, nome: `Arquivo ${n}.pdf`, categoria: 'pessoas', estado: 'enviado',
    tamanho: 100, versao: 1, enviado_por: 'Ana', requisito: null, apagado_em: null, apagado_por: null, updated_at: '2026-11-17T10:00:00Z', ...over,
  }
}

function ctx(perfil: Perfil, brokerId: string | null, db: unknown) {
  return { membro: { id: 'm', userId: 'u', tenantId: T, nome: 'F', perfil, brokerId }, tenant: { id: T }, sessao: { perfil, nome: 'F', corretorId: brokerId }, matriz: matrizPadrao(), db } as never
}
const F: FiltroPaginaDocumentos = { aba: 'documentos', categoria: 'todas', q: '', processo: null, pagina: 1 }

function banco() {
  return memoriaSupabase({
    gestao_vendas: [
      venda(A, 'V-2026-0001'),
      venda(B, 'V-2026-0002', { pdf: true }),
      venda(A, 'V-2026-0003', { arquivado: true }),
      venda(A, 'V-2026-0004', { status: 'Venda cancelada' }),
      venda(A, 'V-2026-0900', {}, OUTRO),
    ],
    gestao_documentos: [
      doc('V-2026-0001', { nome: 'RG do vendedor.pdf' }),
      doc('V-2026-0001', { nome: 'Matrícula.pdf', categoria: 'imoveis' }),
      doc('V-2026-0001', { nome: 'Velho.pdf', apagado_em: '2026-11-10T10:00:00Z', apagado_por: 'Ana' }),
      doc('V-2026-0001', { nome: 'Pendente.pdf', estado: 'pendente' }),
      doc('V-2026-0002', { nome: 'Do colega.pdf' }),
      doc('V-2026-0003', { nome: 'De arquivado.pdf' }),
      doc('V-2026-0900', { nome: 'De outro tenant.pdf' }, OUTRO),
    ],
  })
}
const nomes = (r: { itens: { nome: string }[] }) => r.itens.map((d) => d.nome).sort()

describe('documentos paginados', () => {
  test('dono: vê os documentos de processos ativos do tenant; sem pendente, sem arquivado, sem outro tenant', async () => {
    const r = await paginaDeDocumentos(ctx('dono', null, banco().db), F)
    expect(nomes(r)).toEqual(['Do colega.pdf', 'Matrícula.pdf', 'RG do vendedor.pdf'])
    expect(r.abas).toEqual({ documentos: 3, lixeira: 1, 'sem-pdf': 1 })
    expect(r.imoveis['V-2026-0001']).toBe('Imóvel V-2026-0001')
  })

  test('corretor só vê documento dos próprios processos, e a contagem das abas também', async () => {
    const r = await paginaDeDocumentos(ctx('corretor', A, banco().db), F)
    expect(nomes(r)).toEqual(['Matrícula.pdf', 'RG do vendedor.pdf'])
    expect(r.abas.documentos).toBe(2)
  })

  test('corretor sem vínculo não vê nada', async () => {
    const r = await paginaDeDocumentos(ctx('corretor', null, banco().db), F)
    expect(r.itens).toEqual([])
    expect(r.abas).toEqual({ documentos: 0, lixeira: 0, 'sem-pdf': 0 })
  })

  test('lixeira: só quem apaga documento; o corretor recebe 403 e contagem 0', async () => {
    await expect(paginaDeDocumentos(ctx('corretor', A, banco().db), { ...F, aba: 'lixeira' })).rejects.toMatchObject({ statusCode: 403 })
    expect((await paginaDeDocumentos(ctx('corretor', A, banco().db), F)).abas.lixeira).toBe(0)
    const r = await paginaDeDocumentos(ctx('dono', null, banco().db), { ...F, aba: 'lixeira' })
    expect(nomes(r)).toEqual(['Velho.pdf'])
  })

  test('categoria e busca (nome, id ou imóvel, sem acento) — e a contagem das abas ignora os dois', async () => {
    const m = banco()
    expect(nomes(await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, categoria: 'imoveis' }))).toEqual(['Matrícula.pdf'])
    const porNome = await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, q: 'matricula' })
    expect(nomes(porNome)).toEqual(['Matrícula.pdf'])
    expect(porNome.abas.documentos).toBe(3)
    expect(nomes(await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, q: 'imovel v-2026-0002' }))).toEqual(['Do colega.pdf'])
  })

  test('?processo=: só aquele processo, e só se for visível a quem pergunta', async () => {
    const m = banco()
    expect(nomes(await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, processo: 'V-2026-0002' }))).toEqual(['Do colega.pdf'])
    expect((await paginaDeDocumentos(ctx('corretor', A, m.db), { ...F, processo: 'V-2026-0002' })).itens).toEqual([])
    expect((await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, processo: 'V-2026-0900' })).itens).toEqual([])
  })

  test('contratos sem PDF: ativos sem pdf, sem cancelada, só o que o membro vê', async () => {
    const r = await paginaDeDocumentos(ctx('dono', null, banco().db), { ...F, aba: 'sem-pdf' })
    expect(r.contratos.map((c) => c.id)).toEqual(['V-2026-0001'])
    expect(r.itens).toEqual([])
    expect(r.contratos[0]).toEqual({ id: 'V-2026-0001', imovel: 'Imóvel V-2026-0001', status: 'Em negociação' })
    const c = await paginaDeDocumentos(ctx('corretor', B, banco().db), { ...F, aba: 'sem-pdf' })
    expect(c.contratos).toEqual([])
  })

  test('toda query leva o tenant', async () => {
    const m = banco()
    await paginaDeDocumentos(ctx('corretor', A, m.db), F)
    expect(m.consultas.filter((c) => c.table === 'gestao_vendas' || c.table === 'gestao_documentos').every((c) => c.eq.tenant_id === T)).toBe(true)
  })

  test('mais de uma página: fatia de 24 e o total é o do filtro inteiro', async () => {
    const m = memoriaSupabase({
      gestao_vendas: [venda(A, 'V-2026-0001')],
      gestao_documentos: Array.from({ length: 30 }, () => doc('V-2026-0001')),
    })
    const p1 = await paginaDeDocumentos(ctx('dono', null, m.db), F)
    const p2 = await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, pagina: 2 })
    expect([p1.itens.length, p2.itens.length, p1.total, p1.paginas]).toEqual([24, 6, 30, 2])
    expect(new Set([...p1.itens, ...p2.itens].map((d) => d.id)).size).toBe(30)
  })

  test('passou do teto de 5000 documentos: avisa', async () => {
    const m = memoriaSupabase({
      gestao_vendas: [venda(A, 'V-2026-0001')],
      gestao_documentos: Array.from({ length: 5200 }, () => doc('V-2026-0001')),
    })
    const r = await paginaDeDocumentos(ctx('dono', null, m.db), F)
    expect(r.truncado).toBe(true)
    expect(r.total).toBe(5000)
  })
})

describe('documentos de locação', () => {
  const L_A = 'L-2026-0001'
  const L_B = 'L-2026-0002'
  const L_OUTRO = 'L-2026-0900'

  function loc(id: string, corretorId: string, over: { arquivado?: boolean } = {}, tenant = T) {
    const r = abrirLocacao({ processos: [], documentos: [], locacoes: [] }, { locador: 'Ana', locatario: 'Bruno', imovelId: '22222222-2222-4222-8222-222222222222', imovel: `Casa ${id}`, corretorId }, { nome: 'C' }, '17/11/2026 10:00')
    if (!r.ok) throw new Error(r.erro)
    return { ...toLocacaoRow({ ...r.estado.locacoes[0]!, id, ...over }, tenant), versao: 1, updated_at: '2026-11-17T10:00:00Z' }
  }
  const dl = (alvo: string, over: Record<string, unknown> = {}, tenant = T) => doc(alvo, { alvo_tipo: 'locacao', ...over }, tenant)

  function banco() {
    return memoriaSupabase({
      gestao_vendas: [venda(A, 'V-2026-0001')],
      gestao_locacoes: [loc(L_A, A), loc(L_B, B), loc('L-2026-0003', A, { arquivado: true }), loc(L_OUTRO, A, {}, OUTRO)],
      gestao_documentos: [
        doc('V-2026-0001', { nome: 'Da venda.pdf' }),
        dl(L_A, { nome: 'Contrato de locação.pdf', categoria: 'locacao' }),
        dl(L_A, { nome: 'Velho de locação.pdf', apagado_em: '2026-11-10T10:00:00Z', apagado_por: 'Ana' }),
        dl(L_B, { nome: 'Da locação do colega.pdf' }),
        dl('L-2026-0003', { nome: 'De locação arquivada.pdf' }),
        dl(L_OUTRO, { nome: 'De outro tenant.pdf' }, OUTRO),
        dl(L_A, { nome: 'Pendente.pdf', estado: 'pendente' }),
      ],
    })
  }

  test('dono vê documentos de venda e de locação ativas; sem arquivada, outro tenant ou pendente', async () => {
    const r = await paginaDeDocumentos(ctx('dono', null, banco().db), F)
    expect(nomes(r)).toEqual(['Contrato de locação.pdf', 'Da locação do colega.pdf', 'Da venda.pdf'])
    expect(r.abas).toMatchObject({ documentos: 3, lixeira: 1 })
    expect(r.imoveis[L_A]).toBe(`Casa ${L_A}`)
  })

  test('corretor só vê documento das próprias locações (e vendas)', async () => {
    const r = await paginaDeDocumentos(ctx('corretor', A, banco().db), F)
    expect(nomes(r)).toEqual(['Contrato de locação.pdf', 'Da venda.pdf'])
  })

  test('?processo=L-…: só aquela locação; a de outro corretor não aparece', async () => {
    const m = banco()
    expect(nomes(await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, processo: L_B }))).toEqual(['Da locação do colega.pdf'])
    expect((await paginaDeDocumentos(ctx('corretor', A, m.db), { ...F, processo: L_B })).itens).toEqual([])
    expect((await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, processo: L_OUTRO })).itens).toEqual([])
  })

  test('lixeira inclui locação; «sem PDF» continua só de venda', async () => {
    const m = banco()
    expect(nomes(await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, aba: 'lixeira' }))).toEqual(['Velho de locação.pdf'])
    const sem = await paginaDeDocumentos(ctx('dono', null, m.db), { ...F, aba: 'sem-pdf' })
    expect(sem.contratos.every((c) => c.id.startsWith('V-'))).toBe(true)
  })

  test('busca pelo imóvel da locação', async () => {
    expect(nomes(await paginaDeDocumentos(ctx('dono', null, banco().db), { ...F, q: `casa ${L_B}` }))).toEqual(['Da locação do colega.pdf'])
  })

  test('toda query leva o tenant', async () => {
    const m = banco()
    await paginaDeDocumentos(ctx('corretor', A, m.db), F)
    expect(m.consultas.filter((c) => ['gestao_vendas', 'gestao_locacoes', 'gestao_documentos'].includes(c.table)).every((c) => c.eq.tenant_id === T)).toBe(true)
  })
})
