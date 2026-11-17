import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import { idDeRota } from '~~/server/utils/validate'
import { memoriaSupabase } from '../helpers/memoria-supabase'

/**
 * Endpoints finos de documentos. A F1 (`gestao-auth`, `gestao-evento`) ainda não
 * está nesta branch: os dois módulos são simulados por `vi.mock` com as
 * ASSINATURAS do plano — `requireGestaoMember`, `exigirPermissao`,
 * `registrarEvento` (o alias para cascas, em `vitest.config.ts`, só faz o import
 * resolver). Quando a F1 entrar, os mocks continuam valendo: o contrato é o mesmo.
 */
const f1 = vi.hoisted(() => ({
  ctx: null as unknown,
  perfilSemPermissao: new Set<string>(),
  eventos: [] as unknown[],
  falhaEvento: false,
}))

vi.mock('~~/server/utils/gestao-auth', () => ({
  requireGestaoMember: async () => f1.ctx,
  exigirPermissao: (_ctx: unknown, chave: string) => {
    if (f1.perfilSemPermissao.has(chave)) throw Object.assign(new Error('sem permissão'), { statusCode: 403 })
  },
}))
vi.mock('~~/server/repositories/gestao-evento.repository', () => ({
  registrarEvento: async (_db: unknown, tenantId: string, e: unknown) => {
    if (f1.falhaEvento) throw new Error('banco fora')
    f1.eventos.push({ tenantId, ...(e as object) })
  },
}))

const TA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PDF = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])])
let m: ReturnType<typeof memoriaSupabase>
let corpo: unknown
let query: Record<string, unknown>
let params: Record<string, string>

beforeEach(() => {
  m = memoriaSupabase({
    gestao_vendas: [{ tenant_id: TA, id: 'V-2026-0001', corretor_id: 'c1', updated_at: '2026-11-01' }],
  })
  f1.ctx = {
    membro: { id: 'm1', userId: 'u1', tenantId: TA, nome: 'Helena', perfil: 'dono', brokerId: null },
    matriz: matrizPadrao(),
    db: m.db,
  }
  f1.perfilSemPermissao.clear()
  f1.eventos.length = 0
  f1.falhaEvento = false
  corpo = {}
  query = {}
  params = {}
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', async () => corpo)
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('idDeRota', idDeRota)
  vi.stubGlobal('getRouterParam', (_e: unknown, k: string) => params[k])
})

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (e: unknown) => Promise<any>
const ROTAS: Record<string, () => Promise<{ default: unknown }>> = {
  '.get': () => import('~~/server/api/gestao/documentos.get'),
  '/upload.post': () => import('~~/server/api/gestao/documentos/upload.post'),
  '/lixeira.get': () => import('~~/server/api/gestao/documentos/lixeira.get'),
  '/[id]/confirmar.post': () => import('~~/server/api/gestao/documentos/[id]/confirmar.post'),
  '/[id]/conferir.post': () => import('~~/server/api/gestao/documentos/[id]/conferir.post'),
  '/[id]/apagar.post': () => import('~~/server/api/gestao/documentos/[id]/apagar.post'),
  '/[id]/restaurar.post': () => import('~~/server/api/gestao/documentos/[id]/restaurar.post'),
  '/[id]/download.get': () => import('~~/server/api/gestao/documentos/[id]/download.get'),
}
const rota = async (caminho: string) => (await ROTAS[caminho]!()).default as Handler
const codigo = (p: Promise<unknown>) => p.then(() => 200, (e) => e.statusCode as number)

async function enviarPeloEndpoint() {
  corpo = { alvo: 'venda:V-2026-0001', nome: 'RG.pdf', tamanho: 8, mime: 'application/pdf', categoria: 'pessoas' }
  const ini = await (await rota('/upload.post'))({})
  m.objetos.set(m.eventosStorage.filter((e) => e.op === 'upload-url').at(-1)!.caminho, PDF)
  params = { id: ini.documentoId }
  return ini.documentoId as string
}

describe('permissão por ação', () => {
  test.each([
    ['/upload.post', 'enviarDocs'],
    ['/[id]/confirmar.post', 'enviarDocs'],
    ['/[id]/conferir.post', 'conferir'],
    ['/[id]/apagar.post', 'apagarDocs'],
    ['/[id]/restaurar.post', 'apagarDocs'],
    ['/lixeira.get', 'apagarDocs'],
  ])('%s exige %s e não toca no banco sem ela', async (arq, chave) => {
    f1.perfilSemPermissao.add(chave)
    params = { id: '11111111-1111-4111-8111-111111111111' }
    expect(await codigo((await rota(arq))({}))).toBe(403)
    expect(m.consultas).toHaveLength(0)
    expect(m.eventosStorage).toHaveLength(0)
  })
})

describe('id de rota', () => {
  test('malformado é 400 antes de qualquer consulta', async () => {
    params = { id: '../../x' }
    for (const arq of ['/[id]/confirmar.post', '/[id]/conferir.post', '/[id]/apagar.post', '/[id]/restaurar.post', '/[id]/download.get']) {
      expect(await codigo((await rota(arq))({})), arq).toBe(400)
    }
    expect(m.consultas).toHaveLength(0)
  })
})

describe('fluxo e auditoria', () => {
  test('envia, confirma, confere, baixa, apaga e restaura — cada passo vira evento do ator da sessão', async () => {
    const id = await enviarPeloEndpoint()
    await (await rota('/[id]/confirmar.post'))({})
    await (await rota('/[id]/conferir.post'))({})
    const r = await (await rota('/[id]/download.get'))({})
    expect(r).toEqual({ url: expect.stringContaining('?sig'), expiraEmSegundos: 60 })
    await (await rota('/[id]/apagar.post'))({})
    await (await rota('/[id]/restaurar.post'))({})
    expect(f1.eventos).toHaveLength(6)
    for (const e of f1.eventos as Record<string, unknown>[]) {
      expect(e).toMatchObject({ tenantId: TA, atorUserId: 'u1', atorNome: 'Helena', alvoTipo: 'documento', alvoId: id })
    }
  })

  test('download: sem registro de auditoria não sai URL', async () => {
    await enviarPeloEndpoint()
    await (await rota('/[id]/confirmar.post'))({})
    f1.falhaEvento = true
    expect(await codigo((await rota('/[id]/download.get'))({}))).toBe(500)
  })

  test('apagar: falha na auditoria não desfaz nem esconde a ação', async () => {
    await enviarPeloEndpoint()
    await (await rota('/[id]/confirmar.post'))({})
    f1.falhaEvento = true
    const doc = await (await rota('/[id]/apagar.post'))({})
    expect(doc.apagado).not.toBeNull()
  })

  test('lista e lixeira repassam ?alvo= ao serviço', async () => {
    const id = await enviarPeloEndpoint()
    await (await rota('/[id]/confirmar.post'))({})
    query = { alvo: 'venda:V-2026-0001' }
    expect((await (await rota('.get'))({})).map((d: { id: string }) => d.id)).toEqual([id])
    expect(await (await rota('/lixeira.get'))({})).toEqual([])
  })
})

describe('os endpoints não aceitam tenant, caminho nem autor do cliente', () => {
  const raizApi = join(process.cwd(), 'server', 'api', 'gestao')
  const arquivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? arquivos(join(dir, n)) : [join(dir, n)]))
  const docs = arquivos(raizApi).filter((f) => f.includes('documentos'))

  test('existem os 8 endpoints do plano', () => {
    expect(docs.map((f) => f.slice(raizApi.length + 1)).sort()).toEqual([
      'documentos.get.ts',
      'documentos/[id]/apagar.post.ts',
      'documentos/[id]/conferir.post.ts',
      'documentos/[id]/confirmar.post.ts',
      'documentos/[id]/download.get.ts',
      'documentos/[id]/restaurar.post.ts',
      'documentos/lixeira.get.ts',
      'documentos/upload.post.ts',
    ])
  })

  test.each(docs.map((f) => [f.slice(raizApi.length + 1), f]))('%s: autentica por requireGestaoMember e nunca lê tenant/caminho do corpo', (_n, f) => {
    const src = readFileSync(f as string, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(src).toContain('requireGestaoMember(event)')
    expect(src).not.toMatch(/tenant_?id|storage_?path|serviceSupabase|useTenantContext/i)
    // corpo sempre vai para o serviço, que só lê campos conhecidos
    expect(src).not.toMatch(/body\.|corpo\./)
  })
})
