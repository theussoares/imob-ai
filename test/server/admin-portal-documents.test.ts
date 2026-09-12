import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  createPortalDocument,
  deletePortalDocument,
  listDocumentsForContract,
  updatePortalDocument,
} from '~~/server/repositories/portal-document.repository'
import {
  assertPortalDocumentInput,
  assertPortalDocumentUpdateInput,
} from '~~/server/utils/validate'
import { fakeSupabase, hadEq, touched, type RecordedCall } from '../helpers/fake-supabase'

/**
 * Card 1.3 — publicação de documentos pelo painel.
 *
 * Três coisas são protegidas aqui, e as três já causaram — ou causariam — o
 * mesmo estrago: o cliente errado recebendo o documento.
 *
 *  1. **o path** — `storage_path` é texto livre e nenhuma policy o confere.
 *  2. **a audiência** — vazia não pode virar "todo mundo"; é o campo que separa
 *     o boleto do inquilino do extrato do proprietário.
 *  3. **o rascunho** — `published_at` nasce nulo. Publicar é um ato, não o
 *     efeito colateral de subir um arquivo.
 */

const TENANT = 't1'
const SLUG = 'olmi'
const CONTRATO = 'c1'

function contractRow(over: Record<string, unknown> = {}) {
  return {
    id: CONTRATO,
    tenant_id: TENANT,
    code: 'LOC-001',
    property_id: null,
    address_label: 'Rua A, 100',
    status: 'ativo',
    started_on: null,
    ends_on: null,
    rent_amount: null,
    due_day: null,
    adjustment_index: null,
    source: 'manual',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function docRow(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    tenant_id: TENANT,
    contract_id: CONTRATO,
    category: 'boleto',
    title: 'Aluguel de março',
    competence: '2026-03-01',
    due_on: '2026-03-10',
    amount: 1850,
    storage_path: 'olmi/c1/abc-123.pdf',
    mime: 'application/pdf',
    size_bytes: 1234,
    audience: ['inquilino'],
    published_at: null,
    created_by: 'u1',
    created_at: '2026-03-01T00:00:00.000Z',
    ...over,
  }
}

const ENTRADA_VALIDA = {
  category: 'boleto' as const,
  title: 'Aluguel de março',
  audience: ['inquilino' as const],
  storagePath: 'olmi/c1/abc-123.pdf',
}

const ARGS = { tenantId: TENANT, tenantSlug: SLUG, contractId: CONTRATO, createdBy: 'u1' }

/** O objeto enviado no insert desta tabela. */
function insertedRow(calls: RecordedCall[], table: string): Record<string, unknown> {
  const call = calls.find((c) => c.table === table && c.method === 'insert')
  return (call?.args[0] ?? {}) as Record<string, unknown>
}

describe('o path declarado tem que ser deste contrato desta imobiliária', () => {
  test('path de outra imobiliária é recusado antes de gravar', async () => {
    // Nenhuma policy pega isto: para o banco é uma linha válida. A conferência
    // tem que acontecer antes da escrita.
    const { client, calls } = fakeSupabase({ contracts: { data: contractRow(), error: null } })

    await expect(
      createPortalDocument(client, ARGS, {
        ...ENTRADA_VALIDA,
        storagePath: 'tatiane/c1/abc-123.pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(touched(calls, 'portal_documents')).toBe(false)
  })

  test('path de outro contrato da mesma imobiliária é recusado', async () => {
    const { client, calls } = fakeSupabase({ contracts: { data: contractRow(), error: null } })

    await expect(
      createPortalDocument(client, ARGS, { ...ENTRADA_VALIDA, storagePath: 'olmi/c2/abc.pdf' }),
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(touched(calls, 'portal_documents')).toBe(false)
  })

  test('contrato de outra imobiliária nem chega a conferir o path', async () => {
    const { client, calls } = fakeSupabase({ contracts: { data: null, error: null } })

    await expect(
      createPortalDocument(client, { ...ARGS, contractId: 'c-alheio' }, ENTRADA_VALIDA),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(hadEq(calls, 'contracts', 'tenant_id')).toBe(true)
    expect(touched(calls, 'portal_documents')).toBe(false)
  })
})

describe('rascunho é o padrão', () => {
  test('sem `publish`, published_at nasce nulo', async () => {
    // Sem isto, um upload no meio do expediente aparece pela metade para o
    // cliente: a imobiliária sobe 12 boletos e o cliente vê 3.
    const { client, calls } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      portal_documents: { data: docRow(), error: null },
    })

    await createPortalDocument(client, ARGS, ENTRADA_VALIDA)

    expect(insertedRow(calls, 'portal_documents').published_at).toBeNull()
  })

  test('com `publish`, published_at vem preenchido', async () => {
    const { client, calls } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      portal_documents: { data: docRow(), error: null },
    })

    await createPortalDocument(client, ARGS, { ...ENTRADA_VALIDA, publish: true })

    expect(insertedRow(calls, 'portal_documents').published_at).toEqual(expect.any(String))
  })

  test('a audiência gravada é a que veio, não um default do banco', async () => {
    const { client, calls } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      portal_documents: { data: docRow({ audience: ['proprietario'] }), error: null },
    })

    await createPortalDocument(client, ARGS, {
      ...ENTRADA_VALIDA,
      category: 'extrato',
      audience: ['proprietario'],
    })

    // O default da coluna é '{inquilino,proprietario}'. Para extrato de repasse
    // isso mostraria ao inquilino quanto o proprietário recebe.
    expect(insertedRow(calls, 'portal_documents').audience).toEqual(['proprietario'])
  })
})

describe('edição e exclusão ficam no escopo do tenant', () => {
  test('updatePortalDocument filtra por tenant e por id', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: { data: docRow({ title: 'Novo título' }), error: null },
    })

    await updatePortalDocument(client, TENANT, 'd1', { title: 'Novo título' })

    expect(hadEq(calls, 'portal_documents', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'portal_documents', 'id')).toBe(true)
  })

  test('editar o título NÃO despublica o documento', async () => {
    // `publish` ausente não pode virar "despublicar por omissão": o cliente
    // veria o documento sumir porque alguém corrigiu uma vírgula no título.
    const { client, calls } = fakeSupabase({
      portal_documents: { data: docRow(), error: null },
    })

    await updatePortalDocument(client, TENANT, 'd1', { title: 'Corrigido' })

    const update = calls.find((c) => c.table === 'portal_documents' && c.method === 'update')
    expect(update?.args[0]).not.toHaveProperty('published_at')
  })

  test('despublicar zera published_at sem apagar nada', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: { data: docRow(), error: null },
    })

    await updatePortalDocument(client, TENANT, 'd1', { publish: false })

    const update = calls.find((c) => c.table === 'portal_documents' && c.method === 'update')
    expect((update?.args[0] as Record<string, unknown>).published_at).toBeNull()
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  test('documento de outro tenant não é encontrado para editar', async () => {
    const { client } = fakeSupabase({ portal_documents: { data: null, error: null } })

    await expect(
      updatePortalDocument(client, TENANT, 'd-alheio', { title: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  test('deletePortalDocument devolve o path para o handler apagar o arquivo', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: { data: { storage_path: 'olmi/c1/abc-123.pdf' }, error: null },
    })

    const { storagePath } = await deletePortalDocument(client, TENANT, 'd1')

    expect(storagePath).toBe('olmi/c1/abc-123.pdf')
    expect(hadEq(calls, 'portal_documents', 'tenant_id')).toBe(true)
  })
})

describe('listagem do painel', () => {
  test('lista por tenant e contrato, incluindo rascunho', async () => {
    // O painel precisa ver o que ainda não está no ar; o portal, não. É a
    // diferença entre esta função e `listDocumentsForClient`.
    const { client, calls } = fakeSupabase({
      portal_documents: { data: [docRow({ published_at: null })], error: null },
    })

    const docs = await listDocumentsForContract(client, TENANT, CONTRATO)

    expect(hadEq(calls, 'portal_documents', 'tenant_id')).toBe(true)
    expect(hadEq(calls, 'portal_documents', 'contract_id')).toBe(true)
    expect(docs).toHaveLength(1)
    expect(docs[0]?.publishedAt).toBeNull()
  })

  test('o modelo do painel também não carrega storage_path', async () => {
    // Mesma regra do portal: o path não serve a nenhuma tela, e devolvê-lo
    // entrega a chave de busca do objeto.
    const { client } = fakeSupabase({
      portal_documents: { data: [docRow()], error: null },
    })

    const docs = await listDocumentsForContract(client, TENANT, CONTRATO)
    expect(JSON.stringify(docs)).not.toContain('storage_path')
    expect(JSON.stringify(docs)).not.toContain('abc-123.pdf')
  })
})

describe('validação do documento', () => {
  test('aceita o payload mínimo', () => {
    expect(() => assertPortalDocumentInput(ENTRADA_VALIDA)).not.toThrow()
  })

  test('audiência vazia é recusada, não interpretada como "todo mundo"', () => {
    expect(() => assertPortalDocumentInput({ ...ENTRADA_VALIDA, audience: [] })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test('papel inventado na audiência é recusado', () => {
    expect(() =>
      assertPortalDocumentInput({ ...ENTRADA_VALIDA, audience: ['sindico'] }),
    ).toThrow(expect.objectContaining({ statusCode: 422 }))
  })

  test('categoria fora do enum é recusada', () => {
    expect(() => assertPortalDocumentInput({ ...ENTRADA_VALIDA, category: 'multa' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test('sem título e sem arquivo é recusado', () => {
    expect(() => assertPortalDocumentInput({ ...ENTRADA_VALIDA, title: ' ' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
    expect(() => assertPortalDocumentInput({ ...ENTRADA_VALIDA, storagePath: '' })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })

  test('na edição, audiência ausente passa mas audiência vazia não', () => {
    expect(() => assertPortalDocumentUpdateInput({ title: 'Novo' })).not.toThrow()
    expect(() => assertPortalDocumentUpdateInput({ audience: [] })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    )
  })
})

describe('o upload e a exclusão do arquivo usam o client do usuário', () => {
  test('server/api/admin/contracts/[id]/documents** não menciona serviceSupabase', () => {
    /*
     * O arquivo sobe do NAVEGADOR com o token do membro, e a exclusão do objeto
     * vai com o client do usuário. É o que faz as policies de storage da 0028
     * ("member upload/delete portal-docs", que conferem o slug da pasta) serem
     * barreira de verdade.
     *
     * Trocar por service role aqui — ou passar o arquivo pela função para gravar
     * com privilégio — desligaria essa checagem em silêncio: o retorno seria
     * idêntico e nenhum teste de comportamento notaria. É a mesma armadilha que
     * o card 2.3 travou na direção do download.
     */
    const dir = join(process.cwd(), 'server/api/admin/contracts/[id]')
    const arquivos = [
      'documents.get.ts',
      'documents.post.ts',
      'documents/[docId].put.ts',
      'documents/[docId].delete.ts',
    ]

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(dir, arquivo), 'utf8')
      expect(fonte, `${arquivo} usa service role`).not.toMatch(/serviceSupabase/)
      expect(fonte, `${arquivo} não exige membro do tenant`).toMatch(/requireTenantMember/)
    }
  })

  test('o handler de upload não recebe o arquivo — só os metadados', () => {
    // Se um dia o arquivo passar pela função, a policy de upload deixa de ser
    // exercida: quem grava passa a ser o servidor, não o membro.
    const fonte = readFileSync(
      join(process.cwd(), 'server/api/admin/contracts/[id]/documents.post.ts'),
      'utf8',
    )
    expect(fonte).not.toMatch(/readMultipartFormData|storage\.from/)
  })
})
