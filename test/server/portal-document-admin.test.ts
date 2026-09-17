import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import {
  assertCaminhoDoTenant,
  createDocument,
  setDocumentPublished,
} from '~~/server/repositories/portal-document.repository'
import { toPortalDocumentRow } from '~~/server/mappers/portal-document.mapper'
import { assertPortalDocumentInput } from '~~/server/utils/validate'
import type { PortalDocumentInput } from '~~/shared/models/portal'

const TENANT = 'tenant-olmi'
const SLUG = 'olmi'

function entrada(over: Partial<PortalDocumentInput> = {}): PortalDocumentInput {
  return {
    contractId: 'ct-1',
    category: 'contrato',
    title: 'Contrato de locação assinado',
    storagePath: `${SLUG}/ct-1/abc.pdf`,
    mime: 'application/pdf',
    sizeBytes: 1234,
    ...over,
  }
}

describe('assertCaminhoDoTenant', () => {
  test('aceita caminho na pasta do próprio tenant', () => {
    expect(() => assertCaminhoDoTenant('olmi/ct-1/abc.pdf', SLUG)).not.toThrow()
  })

  test('RECUSA caminho na pasta de outra imobiliária', () => {
    // A guarda que fecha o buraco: o storagePath vem do NAVEGADOR, porque o
    // upload vai direto ao Storage. Sem isto, um membro da imobiliária A
    // registraria uma linha no tenant dele apontando para o arquivo da
    // imobiliária B — e a policy do bucket assinaria o download, porque ela
    // casa storage_path com o nome do objeto e confere o contrato, não a pasta.
    expect(() => assertCaminhoDoTenant('vizinha/ct-9/segredo.pdf', SLUG)).toThrow()
  })

  test('recusa prefixo que só COMEÇA parecido', () => {
    // `olmi-imoveis/...` não é a pasta de `olmi`. Sem a barra no startsWith,
    // passaria.
    expect(() => assertCaminhoDoTenant('olmi-imoveis/ct-1/x.pdf', SLUG)).toThrow()
  })

  test('recusa travessia com ..', () => {
    // Prefixo certo e ainda assim escapa da pasta.
    expect(() => assertCaminhoDoTenant('olmi/../vizinha/x.pdf', SLUG)).toThrow()
  })

  test('recusa caminho vazio', () => {
    expect(() => assertCaminhoDoTenant('', SLUG)).toThrow()
    expect(() => assertCaminhoDoTenant('   ', SLUG)).toThrow()
  })
})

describe('createDocument', () => {
  test('recusa antes de tocar no banco quando o caminho é de outro tenant', async () => {
    const { client, calls } = fakeSupabase({})
    await expect(
      createDocument(client, TENANT, SLUG, entrada({ storagePath: 'vizinha/x.pdf' }), 'u1'),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(calls).toEqual([])
  })

  test('recusa contrato que não é deste tenant', async () => {
    const { client } = fakeSupabase({ contracts: { data: null, error: null } })
    await expect(createDocument(client, TENANT, SLUG, entrada(), 'u1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('toPortalDocumentRow', () => {
  test('nasce SEMPRE como rascunho', () => {
    // Publicar é um segundo ato: sem isso a imobiliária sobe 12 documentos ao
    // longo do dia e o cliente vê a lista pela metade.
    expect(toPortalDocumentRow(entrada(), TENANT, 'u1').published_at).toBeNull()
  })

  test('a audiência cai no default da CATEGORIA quando não vem', () => {
    // O default é código, não caixinha em branco no formulário.
    expect(toPortalDocumentRow(entrada({ category: 'boleto' }), TENANT, null).audience).toEqual([
      'inquilino',
    ])
    expect(toPortalDocumentRow(entrada({ category: 'extrato' }), TENANT, null).audience).toEqual([
      'proprietario',
    ])
    expect(
      toPortalDocumentRow(entrada({ category: 'contrato_administracao' }), TENANT, null).audience,
    ).toEqual(['proprietario'])
  })

  test('audiência explícita vence o default', () => {
    const row = toPortalDocumentRow(
      entrada({ category: 'boleto', audience: ['inquilino', 'fiador'] }),
      TENANT,
      null,
    )
    expect(row.audience).toEqual(['inquilino', 'fiador'])
  })

  test('audiência vazia NÃO vira audiência vazia — cai no default', () => {
    // Array vazio gravaria um documento que ninguém vê. O default seguro é
    // melhor resposta que o silêncio.
    const row = toPortalDocumentRow(entrada({ category: 'extrato', audience: [] }), TENANT, null)
    expect(row.audience).toEqual(['proprietario'])
  })
})

describe('setDocumentPublished', () => {
  test('publicar grava a data; despublicar volta a nulo', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: [
        { data: { id: 'd1', published_at: '2026-09-16T00:00:00.000Z', audience: [] }, error: null },
        { data: { id: 'd1', published_at: null, audience: [] }, error: null },
      ],
    })

    await setDocumentPublished(client, TENANT, 'd1', true)
    await setDocumentPublished(client, TENANT, 'd1', false)

    const updates = calls.filter((c) => c.method === 'update')
    expect((updates[0]?.args[0] as { published_at: unknown }).published_at).toBeTruthy()
    expect((updates[1]?.args[0] as { published_at: unknown }).published_at).toBeNull()
  })

  test('toda escrita é escopada por tenant', async () => {
    const { client, calls } = fakeSupabase({
      portal_documents: { data: { id: 'd1', audience: [] }, error: null },
    })
    await setDocumentPublished(client, TENANT, 'd1', true)
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual([
      'tenant_id',
      TENANT,
    ])
  })
})

describe('assertPortalDocumentInput', () => {
  test('aceita o payload mínimo', () => {
    expect(() => assertPortalDocumentInput(entrada())).not.toThrow()
  })

  test('exige arquivo enviado', () => {
    expect(() => assertPortalDocumentInput(entrada({ storagePath: '' }))).toThrow()
  })

  test('recusa categoria inventada', () => {
    expect(() =>
      assertPortalDocumentInput(entrada({ category: 'apolice' as never })),
    ).toThrow()
  })

  test('audiência ausente é válida — significa usar o default', () => {
    const { audience: _a, ...semAudiencia } = entrada()
    expect(() => assertPortalDocumentInput(semAudiencia)).not.toThrow()
  })

  test('audiência presente e inválida é recusada', () => {
    expect(() =>
      assertPortalDocumentInput(entrada({ audience: ['sindico'] as never })),
    ).toThrow()
  })
})
