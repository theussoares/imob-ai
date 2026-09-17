import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import {
  getDocumentWithPath,
  listDocumentsForClient,
} from '~~/server/repositories/portal-document.repository'

const TENANT = 'tenant-olmi'
const CONTRATO = 'ct-1'
const PUBLICADO = '2026-09-11T12:00:00.000Z'

function docRow(over: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    tenant_id: TENANT,
    contract_id: CONTRATO,
    category: 'contrato',
    title: 'Contrato de locação',
    competence: null,
    due_on: null,
    amount: null,
    storage_path: 'olmi/ct-1/contrato.pdf',
    mime: 'application/pdf',
    size_bytes: 1234,
    audience: ['inquilino', 'proprietario', 'fiador'],
    published_at: PUBLICADO,
    created_by: null,
    created_at: PUBLICADO,
    ...over,
  }
}

describe('listDocumentsForClient', () => {
  test('o inquilino NÃO recebe o extrato de repasse do proprietário', async () => {
    // O vazamento clássico da feature. A RLS já filtra, mas quem chama pode
    // passar o client de service role — que ignora RLS. Este filtro é o que
    // sobra nesse caminho.
    const { client } = fakeSupabase({
      portal_documents: {
        data: [
          docRow(),
          docRow({ id: 'doc-extrato', category: 'extrato', audience: ['proprietario'] }),
        ],
        error: null,
      },
    })

    const docs = await listDocumentsForClient(client, TENANT, CONTRATO, ['inquilino'])
    expect(docs.map((d) => d.id)).toEqual(['doc-1'])
  })

  test('o proprietário NÃO recebe o recibo do inquilino', async () => {
    const { client } = fakeSupabase({
      portal_documents: {
        data: [docRow({ id: 'doc-recibo', category: 'recibo', audience: ['inquilino'] })],
        error: null,
      },
    })
    expect(await listDocumentsForClient(client, TENANT, CONTRATO, ['proprietario'])).toEqual([])
  })

  test('o contrato de administração não chega ao inquilino', async () => {
    // A categoria criada a partir do material real: traz taxa de administração
    // e dados bancários do proprietário.
    const { client } = fakeSupabase({
      portal_documents: {
        data: [
          docRow({
            id: 'doc-adm',
            category: 'contrato_administracao',
            audience: ['proprietario'],
          }),
        ],
        error: null,
      },
    })
    expect(await listDocumentsForClient(client, TENANT, CONTRATO, ['inquilino'])).toEqual([])
    expect(
      (await listDocumentsForClient(client, TENANT, CONTRATO, ['proprietario'])).map((d) => d.id),
    ).toEqual(['doc-adm'])
  })

  test('rascunho não sai nem para quem é do contrato', async () => {
    // A query já pede published_at not null; este teste cobre o caso de a linha
    // chegar mesmo assim (service role, ou filtro removido por engano).
    const { client } = fakeSupabase({
      portal_documents: { data: [docRow({ published_at: null })], error: null },
    })
    expect(await listDocumentsForClient(client, TENANT, CONTRATO, ['inquilino'])).toEqual([])
  })

  test('sem papel no contrato não há consulta nem resultado', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: { data: [docRow()], error: null },
    })
    expect(await listDocumentsForClient(client, TENANT, CONTRATO, [])).toEqual([])
    // Não adianta filtrar depois se a viagem ao banco já aconteceu: sem papel a
    // resposta é sempre vazia, e a consulta não tem como mudar isso.
    expect(calls).toEqual([])
  })

  test('a consulta é escopada por tenant e por contrato', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: { data: [docRow()], error: null },
    })
    await listDocumentsForClient(client, TENANT, CONTRATO, ['inquilino'])
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['tenant_id', TENANT])
    expect(eqs).toContainEqual(['contract_id', CONTRATO])
  })
})

describe('getDocumentWithPath', () => {
  test('devolve o caminho no bucket, que o modelo de domínio não tem', async () => {
    const { client } = fakeSupabase({ portal_documents: { data: docRow(), error: null } })
    const doc = await getDocumentWithPath(client, TENANT, 'doc-1')
    expect(doc?.storagePath).toBe('olmi/ct-1/contrato.pdf')
  })

  test('não decide permissão — devolve o documento como ele está', async () => {
    // A separação é proposital: quem assina o download tem que chamar
    // canClientSeeDocument. Se esta função filtrasse, seria fácil achar que a
    // autorização veio junto da busca.
    const { client } = fakeSupabase({
      portal_documents: { data: docRow({ audience: ['proprietario'] }), error: null },
    })
    const doc = await getDocumentWithPath(client, TENANT, 'doc-1')
    expect(doc?.audience).toEqual(['proprietario'])
  })
})
