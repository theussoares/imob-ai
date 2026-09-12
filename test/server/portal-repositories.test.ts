import { describe, expect, test } from 'vitest'
import {
  getContractInternal,
  listContracts,
  listContractsForClient,
  rolesInContract,
} from '~~/server/repositories/contract.repository'
import {
  getDocumentForDownload,
  listDocumentsForClient,
} from '~~/server/repositories/portal-document.repository'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Contratos de segurança dos repositories do portal.
 *
 * O que estes testes travam não é comportamento de tela — é o que separa o
 * inquilino de uma imobiliária do contrato de outra pessoa. Cada caso aqui
 * corresponde a uma decisão que a RLS também faz; a duplicação é intencional,
 * porque o caminho do download roda com privilégio que ignora RLS.
 */

const PORTAL_USER = 'pu-1'
const TENANT = 't1'

function contractRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    tenant_id: TENANT,
    code: 'LOC-001',
    property_id: null,
    address_label: 'Rua A, 100',
    status: 'ativo',
    started_on: '2026-01-01',
    ends_on: '2027-01-01',
    rent_amount: 1800,
    due_day: 10,
    adjustment_index: 'igpm',
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
    contract_id: 'c1',
    category: 'contrato',
    title: 'Contrato assinado',
    competence: null,
    due_on: null,
    amount: null,
    storage_path: 'olmi/c1/abc.pdf',
    mime: 'application/pdf',
    size_bytes: 1234,
    audience: ['inquilino', 'proprietario'],
    published_at: '2026-09-01T12:00:00.000Z',
    created_by: null,
    created_at: '2026-09-01T12:00:00.000Z',
    ...over,
  }
}

describe('escopo do painel', () => {
  test('listContracts filtra por tenant_id', async () => {
    const { client, calls } = fakeSupabase({ contracts: { data: [contractRow()], error: null } })
    await listContracts(client, TENANT)
    expect(hadEq(calls, 'contracts', 'tenant_id')).toBe(true)
  })

  test('getContractInternal confere o contrato antes de ler o interno', async () => {
    // `contract_internal` não tem tenant_id — a FK para `contracts` é o vínculo.
    // Sem conferir o contrato primeiro, um id direto leria o interno de outra
    // imobiliária.
    const { client, calls } = fakeSupabase({
      contracts: { data: contractRow(), error: null },
      contract_internal: { data: { contract_id: 'c1', notes: 'interno', admin_fee_percent: 10, external_id: null }, error: null },
    })

    await getContractInternal(client, TENANT, 'c1')

    expect(hadEq(calls, 'contracts', 'tenant_id')).toBe(true)
  })

  test('getContractInternal devolve null quando o contrato não é do tenant', async () => {
    const { client, calls } = fakeSupabase({
      contracts: { data: null, error: null },
      contract_internal: { data: { contract_id: 'c1', notes: 'VAZOU', admin_fee_percent: 10, external_id: null }, error: null },
    })

    const interno = await getContractInternal(client, 'outro-tenant', 'c1')

    expect(interno).toBeNull()
    // E nem chega a consultar a tabela interna.
    expect(calls.some((c) => c.table === 'contract_internal')).toBe(false)
  })
})

describe('escopo do portal', () => {
  test('listContractsForClient parte do portal_user_id, não do tenant', async () => {
    const { client, calls } = fakeSupabase({
      contract_parties: { data: [{ role: 'inquilino', contracts: contractRow() }], error: null },
    })

    await listContractsForClient(client, PORTAL_USER)

    expect(hadEq(calls, 'contract_parties', 'portal_user_id')).toBe(true)
  })

  test('agrega papéis quando a pessoa aparece duas vezes no mesmo contrato', async () => {
    // Inquilina e fiadora do mesmo contrato: um contrato na lista, dois papéis.
    const { client } = fakeSupabase({
      contract_parties: {
        data: [
          { role: 'inquilino', contracts: contractRow() },
          { role: 'fiador', contracts: contractRow() },
        ],
        error: null,
      },
    })

    const contratos = await listContractsForClient(client, PORTAL_USER)

    expect(contratos).toHaveLength(1)
    expect(contratos[0]?.roles).toEqual(['inquilino', 'fiador'])
  })

  test('a resposta do portal não carrega campo interno nem tenantId', async () => {
    const { client } = fakeSupabase({
      contract_parties: { data: [{ role: 'inquilino', contracts: contractRow() }], error: null },
    })

    const [contrato] = await listContractsForClient(client, PORTAL_USER)
    const chaves = Object.keys(contrato ?? {})

    for (const proibida of ['notes', 'adminFeePercent', 'externalId', 'tenantId', 'propertyId', 'source']) {
      expect(chaves, `não pode expor "${proibida}"`).not.toContain(proibida)
    }
  })

  test('contrato cujo embed voltou nulo é ignorado', async () => {
    // É o que acontece quando a RLS recusa o contrato — por exemplo com o
    // entitlement do tenant desligado. A lista fica vazia, não quebra.
    const { client } = fakeSupabase({
      contract_parties: { data: [{ role: 'inquilino', contracts: null }], error: null },
    })

    expect(await listContractsForClient(client, PORTAL_USER)).toEqual([])
  })

  test('rolesInContract filtra pela pessoa E pelo contrato', async () => {
    const { client, calls } = fakeSupabase({
      contract_parties: { data: [{ role: 'proprietario' }], error: null },
    })

    const roles = await rolesInContract(client, PORTAL_USER, 'c1')

    expect(roles).toEqual(['proprietario'])
    expect(hadEq(calls, 'contract_parties', 'portal_user_id')).toBe(true)
    expect(hadEq(calls, 'contract_parties', 'contract_id')).toBe(true)
  })
})

describe('download — a barreira que não depende de RLS', () => {
  test('devolve o path quando o papel está na audiência', async () => {
    const { client } = fakeSupabase({ portal_documents: { data: docRow(), error: null } })
    const doc = await getDocumentForDownload(client, 'd1', ['inquilino'])
    expect(doc?.storagePath).toBe('olmi/c1/abc.pdf')
  })

  test('🔴 proprietário NÃO baixa boleto endereçado ao inquilino', async () => {
    const { client } = fakeSupabase({
      portal_documents: { data: docRow({ category: 'boleto', audience: ['inquilino'] }), error: null },
    })
    expect(await getDocumentForDownload(client, 'd1', ['proprietario'])).toBeNull()
  })

  test('🔴 inquilino NÃO baixa extrato endereçado ao proprietário', async () => {
    const { client } = fakeSupabase({
      portal_documents: { data: docRow({ category: 'extrato', audience: ['proprietario'] }), error: null },
    })
    expect(await getDocumentForDownload(client, 'd1', ['inquilino'])).toBeNull()
  })

  test('rascunho não é baixável nem por quem é parte', async () => {
    const { client } = fakeSupabase({
      portal_documents: { data: docRow({ published_at: null }), error: null },
    })
    expect(await getDocumentForDownload(client, 'd1', ['inquilino'])).toBeNull()
  })

  test('quem não é parte do contrato não baixa (papéis vazios)', async () => {
    const { client } = fakeSupabase({ portal_documents: { data: docRow(), error: null } })
    expect(await getDocumentForDownload(client, 'd1', [])).toBeNull()
  })
})

describe('listagem de documentos do portal', () => {
  test('aplica a regra de audiência mesmo que a query tenha devolvido tudo', async () => {
    // Simula o cenário que motiva a barreira dupla: a query voltou documentos
    // que a RLS teria filtrado (porque alguém passou service role). A filtragem
    // em código é o que continua de pé.
    const { client } = fakeSupabase({
      portal_documents: {
        data: [
          docRow({ id: 'contrato', audience: ['inquilino', 'proprietario'] }),
          docRow({ id: 'boleto', audience: ['inquilino'] }),
          docRow({ id: 'extrato', audience: ['proprietario'] }),
        ],
        error: null,
      },
    })

    const docs = await listDocumentsForClient(client, 'c1', ['proprietario'])

    expect(docs.map((d) => d.id)).toEqual(['contrato', 'extrato'])
  })

  test('não expõe storage_path no modelo', async () => {
    const { client } = fakeSupabase({ portal_documents: { data: [docRow()], error: null } })
    const [doc] = await listDocumentsForClient(client, 'c1', ['inquilino'])
    expect(Object.keys(doc ?? {})).not.toContain('storagePath')
    expect(JSON.stringify(doc)).not.toContain('abc.pdf')
  })
})
