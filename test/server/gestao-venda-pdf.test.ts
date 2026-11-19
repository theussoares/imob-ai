import { beforeEach, describe, expect, test } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import type { Perfil, Processo } from '~~/layers/gestao/domain/types'
import {
  apagarDocumentoGestao,
  confirmarEnvio,
  iniciarEnvio,
  restaurarDocumentoGestao,
  type CtxDocs,
} from '~~/server/utils/gestao-documentos'
import { memoriaSupabase } from '../helpers/memoria-supabase'

/**
 * A marca `pdf` do processo («contrato com PDF») segue o documento da categoria `venda`:
 * o servidor a liga quando o documento é confirmado e a desliga quando o último vai para
 * a lixeira. Sem isso «Contratos sem PDF» acusa para sempre, porque a API não deixa o
 * cliente marcar `pdf` (o mock fazia isso na tela).
 */

const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ID = 'V-2026-0142'
const PDF = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])], { type: 'application/pdf' })

let m: ReturnType<typeof memoriaSupabase>

const processo = (over: Partial<Processo> = {}): Processo => ({
  ...processosSeed().find((p) => p.id === ID)!,
  corretorId: 'c1',
  captadorId: 'c1',
  status: 'Em negociação',
  arquivado: false,
  pdf: false,
  ...over,
})
const venda = (p: Processo, tenant = T, versao = 3) => ({
  id: p.id, tenant_id: tenant, corretor_id: p.corretorId, status: p.status, arquivado: p.arquivado, etapa: p.etapa, versao, dados: p, updated_at: '2026-11-17T10:00:00Z',
})

const ctx = (perfil: Perfil = 'dono', brokerId: string | null = null): CtxDocs => ({ membro: { tenantId: T, perfil, brokerId, nome: 'Helena' }, matriz: matrizPadrao(), db: m.db })

async function enviar(categoria: string, c = ctx(), alvo = `venda:${ID}`) {
  const ini = await iniciarEnvio(c, { alvo, nome: 'contrato.pdf', tamanho: 8, mime: 'application/pdf', categoria })
  m.objetos.set(m.eventosStorage.filter((e) => e.op === 'upload-url').at(-1)!.caminho, PDF)
  return confirmarEnvio(c, ini.documentoId)
}
const linhaVenda = (tenant = T) => m.tabelas.gestao_vendas!.find((r) => r.tenant_id === tenant && r.id === ID)!
const pdfGravado = (tenant = T) => (linhaVenda(tenant).dados as Processo).pdf

beforeEach(() => {
  m = memoriaSupabase({ gestao_vendas: [venda(processo()), venda(processo(), TB, 1)], gestao_locacoes: [] })
})

describe('confirmar documento de venda', () => {
  test('categoria `venda`: liga `pdf` na mesma requisição e sobe a versão do processo em 1', async () => {
    await enviar('venda')
    expect(pdfGravado()).toBe(true)
    expect(linhaVenda().versao).toBe(4)
  })

  test('outras categorias não mexem no processo (nem na versão)', async () => {
    await enviar('pessoas')
    await enviar('imoveis')
    expect(pdfGravado()).toBe(false)
    expect(linhaVenda().versao).toBe(3)
  })

  test('processo que já tem `pdf` não é regravado: a versão não sobe à toa', async () => {
    m.tabelas.gestao_vendas![0] = venda(processo({ pdf: true }))
    await enviar('venda')
    expect(linhaVenda().versao).toBe(3)
  })

  test('só o processo do alvo, só no tenant do membro: o mesmo id em outro tenant fica como estava', async () => {
    await enviar('venda')
    expect(pdfGravado(TB)).toBe(false)
    expect(linhaVenda(TB).versao).toBe(1)
    const escritas = m.consultas.filter((c) => c.table === 'gestao_vendas' && c.op === 'update')
    expect(escritas.length).toBeGreaterThan(0)
    for (const e of escritas) expect(e.eq).toMatchObject({ tenant_id: T, id: ID })
  })

  test('a escrita é condicionada à versão lida (concorrência otimista)', async () => {
    await enviar('venda')
    const upd = m.consultas.find((c) => c.table === 'gestao_vendas' && c.op === 'update')!
    expect(upd.eq.versao).toBe(3)
  })

  test('locação com documento de categoria `venda` não toca em venda nenhuma', async () => {
    m.tabelas.gestao_locacoes!.push({ tenant_id: T, id: 'L-2026-0001', corretor_id: 'c1', arquivado: false, updated_at: '2026-11-01' })
    await enviar('venda', ctx(), 'locacao:L-2026-0001')
    expect(pdfGravado()).toBe(false)
    expect(m.consultas.some((c) => c.table === 'gestao_vendas' && c.op === 'update')).toBe(false)
  })

  test('upload recusado (arquivo que não é PDF/imagem) não liga o `pdf`', async () => {
    const ini = await iniciarEnvio(ctx(), { alvo: `venda:${ID}`, nome: 'x.pdf', tamanho: 8, mime: 'application/pdf', categoria: 'venda' })
    m.objetos.set(m.eventosStorage.at(-1)!.caminho, new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])]))
    await expect(confirmarEnvio(ctx(), ini.documentoId)).rejects.toMatchObject({ statusCode: 422 })
    expect(pdfGravado()).toBe(false)
  })
})

describe('lixeira', () => {
  test('apagar o único documento de venda desliga `pdf`; restaurar liga de novo', async () => {
    const d = await enviar('venda')
    expect(pdfGravado()).toBe(true)
    await apagarDocumentoGestao(ctx(), d.id)
    expect(pdfGravado()).toBe(false)
    await restaurarDocumentoGestao(ctx(), d.id)
    expect(pdfGravado()).toBe(true)
  })

  test('sobrando outro documento de venda, apagar um não desliga', async () => {
    const d1 = await enviar('venda')
    await enviar('venda')
    await apagarDocumentoGestao(ctx(), d1.id)
    expect(pdfGravado()).toBe(true)
    const antes = linhaVenda().versao
    await apagarDocumentoGestao(ctx(), (m.tabelas.gestao_documentos!.find((r) => r.apagado_em == null)!.id) as string)
    expect(pdfGravado()).toBe(false)
    expect(linhaVenda().versao).toBe(antes + 1)
  })

  test('apagar documento de outra categoria não desliga o `pdf` do contrato', async () => {
    await enviar('venda')
    const rg = await enviar('pessoas')
    await apagarDocumentoGestao(ctx(), rg.id)
    expect(pdfGravado()).toBe(true)
  })

  test('upload pendente (não confirmado) não conta como contrato: nada liga', async () => {
    await iniciarEnvio(ctx(), { alvo: `venda:${ID}`, nome: 'x.pdf', tamanho: 8, mime: 'application/pdf', categoria: 'venda' })
    expect(pdfGravado()).toBe(false)
  })
})

describe('falhas na marca não desfazem o documento', () => {
  test('processo sem `dados` válido: o documento continua confirmado e o erro só vai ao log', async () => {
    m.tabelas.gestao_vendas![0] = { ...venda(processo()), dados: { lixo: true } }
    const d = await enviar('venda')
    expect(d.estado).toBe('enviado')
  })

  test('conflito de versão na marca: relê e tenta de novo (a marca é idempotente), sem perder a outra edição', async () => {
    // Outra aba grava o processo entre a leitura e a escrita da marca: simulado pelo 1º update perder a corrida.
    const real = m.db.from.bind(m.db)
    let corridas = 0
    m.db.from = (t: string) => {
      const c = real(t)
      if (t !== 'gestao_vendas') return c
      const upd = c.update.bind(c)
      c.update = (v: Record<string, unknown>) => {
        if (corridas++ === 0) {
          Object.assign(linhaVenda(), { versao: 9, dados: { ...(linhaVenda().dados as Processo), obs: 'da outra aba' } })
        }
        return upd(v)
      }
      return c
    }
    await enviar('venda')
    expect(pdfGravado()).toBe(true)
    expect((linhaVenda().dados as Processo & { obs?: string }).obs).toBe('da outra aba')
    expect(linhaVenda().versao).toBe(10)
  })
})
