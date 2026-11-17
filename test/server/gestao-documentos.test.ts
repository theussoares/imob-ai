import { beforeEach, describe, expect, test } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import type { Perfil } from '~~/layers/gestao/domain/types'
import { confirmarVersao } from '~~/server/repositories/gestao-documento.repository'
import {
  apagarDocumentoGestao,
  conferirDocumentoGestao,
  confirmarEnvio,
  iniciarEnvio,
  listarDocumentos,
  listarDocumentosApagados,
  restaurarDocumentoGestao,
  urlDeDownload,
  type CtxDocs,
} from '~~/server/utils/gestao-documentos'
import { memoriaSupabase } from '../helpers/memoria-supabase'

/**
 * Documentos do gestão: isolamento por tenant e por corretor, caminho do
 * Storage decidido pelo servidor e URL assinada só para o que é visível.
 * Usa Supabase em memória (ver o helper) para o `where` de verdade valer.
 */

const TA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PDF = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])], { type: 'application/pdf' })
const EXE = new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])])

let m: ReturnType<typeof memoriaSupabase>

function ctx(tenantId: string, perfil: Perfil, brokerId: string | null, nome = 'Fulano'): CtxDocs {
  return { membro: { tenantId, perfil, brokerId, nome }, matriz: matrizPadrao(), db: m.db }
}
const corretor1 = () => ctx(TA, 'corretor', 'c1', 'Carlos')
const corretor2 = () => ctx(TA, 'corretor', 'c2', 'Bia')
const dono = () => ctx(TA, 'dono', null, 'Helena')
const donoB = () => ctx(TB, 'dono', null, 'Dono B')

const envio = (extra: Record<string, unknown> = {}) => ({
  alvo: 'venda:V-2026-0001',
  nome: 'RG.pdf',
  tamanho: 8,
  mime: 'application/pdf',
  categoria: 'pessoas',
  ...extra,
})

/** Faz o upload inteiro (passo 1, objeto no bucket, passo 2) e devolve o documento. */
async function enviar(c: CtxDocs, extra: Record<string, unknown> = {}, blob = PDF) {
  const ini = await iniciarEnvio(c, envio(extra))
  const caminho = m.eventosStorage.filter((e) => e.op === 'upload-url').at(-1)!.caminho
  m.objetos.set(caminho, blob)
  return { ini, doc: await confirmarEnvio(c, ini.documentoId) }
}

beforeEach(() => {
  m = memoriaSupabase({
    gestao_vendas: [
      { tenant_id: TA, id: 'V-2026-0001', corretor_id: 'c1', updated_at: '2026-11-01' },
      { tenant_id: TA, id: 'V-2026-0002', corretor_id: 'c2', updated_at: '2026-11-02' },
      { tenant_id: TB, id: 'V-2026-0001', corretor_id: 'c1', updated_at: '2026-11-01' },
    ],
    gestao_locacoes: [],
  })
})

const codigo = async (p: Promise<unknown>) => p.then(() => 200, (e) => e.statusCode as number)

describe('envio', () => {
  test('o caminho é do servidor: corpo com tenant, caminho e autor falsos é ignorado', async () => {
    const ini = await iniciarEnvio(
      corretor1(),
      envio({ storagePath: `${TB}/venda/x/y/1`, tenantId: TB, enviadoPor: 'Helena', path: '../x' }),
    )
    const up = m.eventosStorage.find((e) => e.op === 'upload-url')!
    expect(up.caminho).toBe(`${TA}/venda/V-2026-0001/${ini.documentoId}/1`)
    const linha = m.tabelas.gestao_documentos![0]!
    expect(linha.tenant_id).toBe(TA)
    expect(linha.enviado_por).toBe('Carlos')
    expect(linha.estado).toBe('pendente')
    expect(linha.storage_path ?? null).toBeNull()
  })

  test('corretor não envia para o processo de outro corretor (404) e nada é criado', async () => {
    expect(await codigo(iniciarEnvio(corretor1(), envio({ alvo: 'venda:V-2026-0002' })))).toBe(404)
    expect(m.tabelas.gestao_documentos ?? []).toHaveLength(0)
    expect(m.eventosStorage).toHaveLength(0)
  })

  test('processo de outro tenant com o mesmo id: 404 (a venda do tenant B é do c1, mas o ctx é do A)', async () => {
    // Mesmo id nos dois tenants; o dono do B enxerga a do B e só a do B.
    const ini = await iniciarEnvio(donoB(), envio())
    expect(m.tabelas.gestao_documentos![0]!.tenant_id).toBe(TB)
    expect(ini.documentoId).toBeTruthy()
    // Id que só existe no tenant A:
    expect(await codigo(iniciarEnvio(donoB(), envio({ alvo: 'venda:V-2026-0002' })))).toBe(404)
  })

  test.each([
    ['extensão proibida', { nome: 'x.exe', mime: 'application/octet-stream' }],
    ['mime que não bate', { mime: 'image/png' }],
    ['acima de 15 MB', { tamanho: 15 * 1024 * 1024 + 1 }],
    ['categoria inexistente', { categoria: 'segredos' }],
    ['item de checklist inexistente', { requisito: 'nada:nada' }],
    ['alvo malformado', { alvo: 'venda:../x' }],
  ])('recusa %s com 422, sem linha e sem URL', async (_n, extra) => {
    expect(await codigo(iniciarEnvio(dono(), envio(extra)))).toBe(422)
    expect(m.tabelas.gestao_documentos ?? []).toHaveLength(0)
    expect(m.eventosStorage).toHaveLength(0)
  })

  test('o item de checklist manda na categoria', async () => {
    await iniciarEnvio(dono(), envio({ requisito: 'imovel:matricula', categoria: 'pessoas' }))
    expect(m.tabelas.gestao_documentos![0]!.categoria).toBe('imoveis')
  })
})

describe('confirmação', () => {
  test('PDF de verdade vira enviado, v1, e a resposta não traz o caminho do bucket', async () => {
    const { doc } = await enviar(corretor1())
    expect(doc).toMatchObject({ estado: 'enviado', versoes: 1, tamanho: 8, enviadoPor: 'Carlos', processoId: 'V-2026-0001', apagado: null })
    expect(JSON.stringify(doc)).not.toMatch(/storage|path|gestao-docs|tenant/i)
    const [linha] = m.tabelas.gestao_documentos!
    expect(linha!.storage_path).toBe(`${TA}/venda/V-2026-0001/${doc.id}/1`)
    expect(linha!.mime).toBe('application/pdf')
    const lista = await listarDocumentos(corretor1(), 'venda:V-2026-0001')
    expect(lista.map((d) => d.id)).toEqual([doc.id])
    expect(JSON.stringify(lista)).not.toMatch(/storage|gestao-docs/i)
  })

  test('executável com nome .pdf: 422, objeto apagado do bucket e linha descartada', async () => {
    const ini = await iniciarEnvio(corretor1(), envio())
    const caminho = `${TA}/venda/V-2026-0001/${ini.documentoId}/1`
    m.objetos.set(caminho, EXE)
    expect(await codigo(confirmarEnvio(corretor1(), ini.documentoId))).toBe(422)
    expect(m.objetos.has(caminho)).toBe(false)
    expect(m.tabelas.gestao_documentos).toHaveLength(0)
  })

  test('arquivo que não chegou ao bucket: 422', async () => {
    const ini = await iniciarEnvio(corretor1(), envio())
    expect(await codigo(confirmarEnvio(corretor1(), ini.documentoId))).toBe(422)
  })

  test('envio pendente não aparece na lista', async () => {
    await iniciarEnvio(corretor1(), envio())
    expect(await listarDocumentos(corretor1(), 'venda:V-2026-0001')).toHaveLength(0)
  })

  test('outro corretor e outro tenant não confirmam envio alheio (404)', async () => {
    const ini = await iniciarEnvio(corretor1(), envio())
    m.objetos.set(`${TA}/venda/V-2026-0001/${ini.documentoId}/1`, PDF)
    expect(await codigo(confirmarEnvio(corretor2(), ini.documentoId))).toBe(404)
    expect(await codigo(confirmarEnvio(donoB(), ini.documentoId))).toBe(404)
    expect(m.tabelas.gestao_documentos![0]!.estado).toBe('pendente')
  })

  test('nova versão: v2 em outro objeto, conferência volta para enviado, v1 continua no bucket', async () => {
    const { doc } = await enviar(dono())
    await conferirDocumentoGestao(dono(), doc.id)
    const ini2 = await iniciarEnvio(dono(), envio({ documentoId: doc.id, nome: 'RG2.pdf' }))
    expect(ini2).toMatchObject({ documentoId: doc.id, versao: 2 })
    m.objetos.set(`${TA}/venda/V-2026-0001/${doc.id}/2`, PDF)
    const v2 = await confirmarEnvio(dono(), doc.id)
    expect(v2).toMatchObject({ versoes: 2, estado: 'enviado' })
    expect(m.objetos.has(`${TA}/venda/V-2026-0001/${doc.id}/1`)).toBe(true)
    expect(m.tabelas.gestao_documentos![0]!.storage_path).toBe(`${TA}/venda/V-2026-0001/${doc.id}/2`)
  })

  test('nova versão num documento de outro processo ou na lixeira é recusada', async () => {
    const { doc } = await enviar(dono())
    expect(await codigo(iniciarEnvio(dono(), envio({ alvo: 'venda:V-2026-0002', documentoId: doc.id })))).toBe(404)
    await apagarDocumentoGestao(dono(), doc.id)
    expect(await codigo(iniciarEnvio(dono(), envio({ documentoId: doc.id })))).toBe(422)
  })

  test('duas confirmações da mesma troca: a segunda recebe conflito e nada é sobrescrito', async () => {
    const { doc } = await enviar(dono())
    const antes = { ...m.tabelas.gestao_documentos![0]! }
    // A aba lenta ainda acha que a versão atual é 0 (a de antes da primeira confirmação).
    const r = await confirmarVersao(m.db, TA, doc.id, 0, { tamanho: 1, mime: 'application/pdf', storagePath: 'x' })
    expect(r).toBe('conflito')
    expect(m.tabelas.gestao_documentos![0]).toEqual(antes)
  })
})

describe('download (Review Focus 5)', () => {
  test('URL de 60 s no caminho gravado; corpo sem tenant nem caminho', async () => {
    const { doc } = await enviar(corretor1())
    const r = await urlDeDownload(corretor1(), doc.id)
    expect(r.expiraEmSegundos).toBe(60)
    const ev = m.eventosStorage.find((e) => e.op === 'signed-url')!
    expect(ev.caminho).toBe(`${TA}/venda/V-2026-0001/${doc.id}/1`)
    expect(ev.extra).toMatchObject({ segundos: 60 })
  })

  test('documento na lixeira não gera URL; restaurado, gera', async () => {
    const { doc } = await enviar(dono())
    await apagarDocumentoGestao(dono(), doc.id)
    expect(await codigo(urlDeDownload(dono(), doc.id))).toBe(404)
    expect(m.eventosStorage.some((e) => e.op === 'signed-url')).toBe(false)
    await restaurarDocumentoGestao(dono(), doc.id)
    expect((await urlDeDownload(dono(), doc.id)).url).toContain('?sig')
  })

  test('documento de outro tenant não gera URL — nem para o dono do outro tenant', async () => {
    const { doc } = await enviar(dono())
    expect(await codigo(urlDeDownload(donoB(), doc.id))).toBe(404)
    expect(m.eventosStorage.some((e) => e.op === 'signed-url')).toBe(false)
  })

  test('corretor B não baixa documento do processo do corretor A (404, não 403)', async () => {
    const { doc } = await enviar(corretor1())
    expect(await codigo(urlDeDownload(corretor2(), doc.id))).toBe(404)
    expect(await codigo(urlDeDownload(corretor1(), '00000000-0000-4000-8000-000000000000'))).toBe(404)
    expect(await codigo(urlDeDownload(corretor1(), '../../x'))).toBe(404)
  })

  test('envio ainda pendente não tem download', async () => {
    const ini = await iniciarEnvio(dono(), envio())
    expect(await codigo(urlDeDownload(dono(), ini.documentoId))).toBe(404)
  })

  test('linha com caminho de OUTRA pasta (gravação errada) não é assinada', async () => {
    const { doc } = await enviar(dono())
    m.tabelas.gestao_documentos![0]!.storage_path = `${TB}/venda/V-2026-0001/${doc.id}/1`
    expect(await codigo(urlDeDownload(dono(), doc.id))).toBe(404)
    expect(m.eventosStorage.some((e) => e.op === 'signed-url')).toBe(false)
  })
})

describe('conferir, apagar, restaurar e lixeira', () => {
  test('conferir uma vez; de novo é 422; pendente é 404', async () => {
    const { doc } = await enviar(dono())
    expect((await conferirDocumentoGestao(dono(), doc.id)).estado).toBe('conferido')
    expect(await codigo(conferirDocumentoGestao(dono(), doc.id))).toBe(422)
    const ini = await iniciarEnvio(dono(), envio())
    expect(await codigo(conferirDocumentoGestao(dono(), ini.documentoId))).toBe(404)
  })

  test('corretor B não confere, apaga nem restaura documento do corretor A', async () => {
    const { doc } = await enviar(corretor1())
    for (const f of [conferirDocumentoGestao, apagarDocumentoGestao, restaurarDocumentoGestao]) {
      expect(await codigo(f(corretor2(), doc.id))).toBe(404)
    }
    expect(m.tabelas.gestao_documentos![0]!.estado).toBe('enviado')
    expect(m.tabelas.gestao_documentos![0]!.apagado_em ?? null).toBeNull()
  })

  test('apagar registra quem e quando, sai da lista e vai para a lixeira; apagar de novo é 422', async () => {
    const { doc } = await enviar(dono())
    const apagado = await apagarDocumentoGestao(dono(), doc.id)
    expect(apagado.apagado).toMatchObject({ quem: 'Helena' })
    expect(apagado.apagado!.quando).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    expect(await listarDocumentos(dono(), 'venda:V-2026-0001')).toHaveLength(0)
    expect((await listarDocumentosApagados(dono(), 'venda:V-2026-0001')).map((d) => d.id)).toEqual([doc.id])
    expect(await codigo(apagarDocumentoGestao(dono(), doc.id))).toBe(422)
    expect((await restaurarDocumentoGestao(dono(), doc.id)).apagado).toBeNull()
    expect(await codigo(restaurarDocumentoGestao(dono(), doc.id))).toBe(422)
  })

  test('lixeira geral: corretor vê só a dos próprios processos; dono vê as do tenant, e só as do tenant', async () => {
    const d1 = (await enviar(dono(), { alvo: 'venda:V-2026-0001' })).doc
    const d2 = (await enviar(dono(), { alvo: 'venda:V-2026-0002' })).doc
    const dB = (await enviar(donoB(), { alvo: 'venda:V-2026-0001' })).doc
    for (const d of [d1, d2]) await apagarDocumentoGestao(dono(), d.id)
    await apagarDocumentoGestao(donoB(), dB.id)

    expect((await listarDocumentosApagados(corretor1())).map((d) => d.id)).toEqual([d1.id])
    expect((await listarDocumentosApagados(corretor2())).map((d) => d.id)).toEqual([d2.id])
    expect((await listarDocumentosApagados(dono())).map((d) => d.id).sort()).toEqual([d1.id, d2.id].sort())
    expect((await listarDocumentosApagados(donoB())).map((d) => d.id)).toEqual([dB.id])
    // corretor sem vínculo com `brokers` não vê nada
    expect(await listarDocumentosApagados(ctx(TA, 'corretor', null))).toEqual([])
  })

  test('lista de um processo alheio é 404', async () => {
    await enviar(corretor1())
    expect(await codigo(listarDocumentos(corretor2(), 'venda:V-2026-0001'))).toBe(404)
    expect(await codigo(listarDocumentos(corretor1(), 'venda'))).toBe(422)
  })
})

describe('toda query de documentos leva tenant_id', () => {
  test('em todos os caminhos exercitados', async () => {
    const { doc } = await enviar(corretor1())
    await listarDocumentos(corretor1(), 'venda:V-2026-0001')
    await conferirDocumentoGestao(corretor1(), doc.id)
    await urlDeDownload(corretor1(), doc.id)
    await apagarDocumentoGestao(corretor1(), doc.id)
    await listarDocumentosApagados(corretor1())
    await restaurarDocumentoGestao(corretor1(), doc.id)
    const q = m.consultas.filter((c) => c.table === 'gestao_documentos' || c.table.startsWith('gestao_vendas'))
    expect(q.length).toBeGreaterThan(10)
    // `insert` leva tenant_id no valor, não em `eq`.
    for (const c of q.filter((c) => c.op !== 'insert')) expect(c.eq.tenant_id, JSON.stringify(c)).toBe(TA)
    expect(m.tabelas.gestao_documentos![0]!.tenant_id).toBe(TA)
  })
})

describe('concorrência (revisão de segurança)', () => {
  test('conferir não vale para uma versão que o conferente não viu', async () => {
    const { doc } = await enviar(dono())
    const { marcarConferido, confirmarVersao } = await import('~~/server/repositories/gestao-documento.repository')
    // outra aba confirma a v2 depois que o conferente leu a v1
    await confirmarVersao(m.db, TA, doc.id, 1, { tamanho: 1, mime: 'application/pdf', storagePath: `${TA}/venda/V-2026-0001/${doc.id}/2` })
    expect(await marcarConferido(m.db, TA, doc.id, 1)).toBeNull()
    expect(m.tabelas.gestao_documentos![0]!.estado).toBe('enviado')
  })

  test('confirmar versão não acerta documento que foi para a lixeira no meio', async () => {
    const { doc } = await enviar(dono())
    await apagarDocumentoGestao(dono(), doc.id)
    const r = await confirmarVersao(m.db, TA, doc.id, 1, { tamanho: 1, mime: 'application/pdf', storagePath: 'x' })
    expect(r).toBe('conflito')
  })
})

describe('processo arquivado (achado do revisor)', () => {
  const arquivar = () => {
    m.tabelas.gestao_vendas!.find((r) => r.tenant_id === TA && r.id === 'V-2026-0001')!.arquivado = true
  }

  test('corretor não lista nem baixa documento de venda arquivada: o GET do processo já dá 404', async () => {
    const { doc } = await enviar(corretor1())
    arquivar()
    expect(await codigo(listarDocumentos(corretor1(), 'venda:V-2026-0001'))).toBe(404)
    expect(await codigo(urlDeDownload(corretor1(), doc.id))).toBe(404)
    expect(await codigo(conferirDocumentoGestao(corretor1(), doc.id))).toBe(404)
  })

  test('quem vê arquivados (arquivar ou apagarDocs) segue enxergando', async () => {
    const { doc } = await enviar(dono())
    arquivar()
    expect(await listarDocumentos(dono(), 'venda:V-2026-0001')).toHaveLength(1)
    expect((await urlDeDownload(dono(), doc.id)).doc.id).toBe(doc.id)
  })

  test('arquivada de outro corretor continua 404 para todos os corretores', async () => {
    await enviar(corretor1())
    arquivar()
    expect(await codigo(listarDocumentos(corretor2(), 'venda:V-2026-0001'))).toBe(404)
  })
})
