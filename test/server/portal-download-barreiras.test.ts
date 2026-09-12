import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  getDocumentForDownload,
  listDocumentsForClient,
} from '~~/server/repositories/portal-document.repository'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * Card 2.3 — o endpoint mais sensível da entrega.
 *
 * Os dois casos que dão nome a este arquivo são os do topo do QA: o inquilino
 * não pode ver o extrato de repasse do proprietário (quanto o dono recebe), e o
 * proprietário não pode ver o boleto do inquilino (quanto o morador paga).
 * Trocar um pelo outro não é "bug de tela": é mostrar o dinheiro de uma pessoa
 * para outra, dentro de um produto vendido como sigiloso.
 *
 * Aqui testamos a BARREIRA 1 (TypeScript). A barreira 2 (policy de storage) foi
 * verificada direto no banco de produção, com as duas identidades reais do
 * tenant `demo` — inclusive removendo a barreira 1 da equação, que é o item do
 * QA que prova que a segunda existe de verdade.
 */

const CONTRATO = 'c1'

function docRow(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    tenant_id: 't1',
    contract_id: CONTRATO,
    category: 'recibo',
    title: 'Recibo de setembro',
    competence: '2026-09-01',
    due_on: '2026-09-10',
    amount: 2400,
    storage_path: 'demo/c1/recibo.pdf',
    mime: 'application/pdf',
    size_bytes: 1086,
    audience: ['inquilino'],
    published_at: '2026-09-01T12:00:00.000Z',
    created_at: '2026-09-01T12:00:00.000Z',
    ...over,
  }
}

describe('🔴 separação entre inquilino e proprietário', () => {
  test('proprietário NÃO baixa o recibo do inquilino', async () => {
    const { client } = fakeSupabase({
      portal_documents: { data: docRow({ audience: ['inquilino'] }), error: null },
    })

    const doc = await getDocumentForDownload(client, 'd1', ['proprietario'])

    expect(doc).toBeNull()
  })

  test('inquilino NÃO baixa o extrato de repasse do proprietário', async () => {
    const { client } = fakeSupabase({
      portal_documents: {
        data: docRow({ category: 'extrato', audience: ['proprietario'] }),
        error: null,
      },
    })

    const doc = await getDocumentForDownload(client, 'd1', ['inquilino'])

    expect(doc).toBeNull()
  })

  test('cada um baixa o que é seu', async () => {
    const { client: c1 } = fakeSupabase({
      portal_documents: { data: docRow({ audience: ['inquilino'] }), error: null },
    })
    expect(await getDocumentForDownload(c1, 'd1', ['inquilino'])).not.toBeNull()

    const { client: c2 } = fakeSupabase({
      portal_documents: { data: docRow({ audience: ['proprietario'] }), error: null },
    })
    expect(await getDocumentForDownload(c2, 'd1', ['proprietario'])).not.toBeNull()
  })

  test('contrato e vistoria vão para os dois', async () => {
    for (const papel of ['inquilino', 'proprietario', 'fiador'] as const) {
      const { client } = fakeSupabase({
        portal_documents: {
          data: docRow({
            category: 'contrato',
            audience: ['inquilino', 'proprietario', 'fiador'],
          }),
          error: null,
        },
      })
      expect(await getDocumentForDownload(client, 'd1', [papel]), papel).not.toBeNull()
    }
  })
})

describe('rascunho e vínculo', () => {
  test('documento não publicado não é baixado nem por quem é da audiência', async () => {
    const { client } = fakeSupabase({
      portal_documents: { data: docRow({ published_at: null }), error: null },
    })

    expect(await getDocumentForDownload(client, 'd1', ['inquilino'])).toBeNull()
  })

  test('sem papel no contrato, nada é baixado', async () => {
    // `roles` vazio é o que `rolesInContract` devolve para quem não é parte.
    const { client } = fakeSupabase({
      portal_documents: { data: docRow(), error: null },
    })

    expect(await getDocumentForDownload(client, 'd1', [])).toBeNull()
  })

  test('documento inexistente devolve null, sem estourar', async () => {
    const { client } = fakeSupabase({ portal_documents: { data: null, error: null } })

    expect(await getDocumentForDownload(client, 'inventado', ['inquilino'])).toBeNull()
  })
})

describe('listagem aplica a mesma regra da audiência', () => {
  test('a lista do inquilino não inclui o extrato do proprietário', async () => {
    const { client } = fakeSupabase({
      portal_documents: {
        data: [
          docRow({ id: 'd1', title: 'Contrato', audience: ['inquilino', 'proprietario'] }),
          docRow({ id: 'd2', title: 'Recibo', audience: ['inquilino'] }),
          docRow({ id: 'd3', title: 'Extrato', audience: ['proprietario'] }),
        ],
        error: null,
      },
    })

    const docs = await listDocumentsForClient(client, CONTRATO, ['inquilino'])

    expect(docs.map((d) => d.title)).toEqual(['Contrato', 'Recibo'])
  })

  test('nenhum documento da lista carrega o caminho do arquivo', async () => {
    // `storage_path` é a chave de busca do objeto no bucket. Inútil sozinha
    // enquanto o bucket é privado — e exatamente o que seria usado no dia em que
    // uma policy de storage fosse afrouxada por engano.
    const { client } = fakeSupabase({
      portal_documents: { data: [docRow()], error: null },
    })

    const docs = await listDocumentsForClient(client, CONTRATO, ['inquilino'])

    expect(JSON.stringify(docs)).not.toContain('storage_path')
    expect(JSON.stringify(docs)).not.toContain('storagePath')
    expect(JSON.stringify(docs)).not.toContain('demo/c1/recibo.pdf')
  })
})

describe('o download NÃO pode usar service role', () => {
  /*
   * Este é o item do QA "a assinatura usa o client do usuário, não service role".
   * É estático de propósito: nenhum teste de comportamento pega alguém trocando
   * `client` por `serviceSupabase()` numa refatoração — o retorno seria o mesmo,
   * e a barreira 2 sumiria em silêncio.
   */
  const fonte = readFileSync(
    join(process.cwd(), 'server/api/portal/documents/[id]/download.get.ts'),
    'utf8',
  )

  test('a leitura do arquivo usa o client do usuário', () => {
    expect(fonte).toMatch(/client\.storage\s*\n?\s*\.from\('portal-docs'\)/)
  })

  test('service role aparece só na trilha e no rate limit, nunca no storage', () => {
    // Pega o padrão perigoso diretamente: service role encostando no bucket.
    expect(fonte).not.toMatch(/serviceSupabase\(\)\s*\n?\s*\.storage/)
    expect(fonte).not.toMatch(/service\w*\.storage/)

    // E confere que os usos legítimos continuam lá — um teste que só proíbe
    // passaria com o arquivo vazio.
    expect(fonte).toMatch(/logDocumentAccess\(serviceSupabase\(\)/)
    expect(fonte).toMatch(/assertDownloadRateLimit\(serviceSupabase\(\)/)
  })

  test('o handler grava a trilha de acesso', () => {
    expect(fonte).toMatch(/logDocumentAccess/)
  })

  test('o handler passa por rate limit', () => {
    expect(fonte).toMatch(/assertDownloadRateLimit/)
  })
})
