import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import {
  getContractForClient,
  listContracts,
  listContractsForClient,
} from '~~/server/repositories/contract.repository'

const TENANT = 'tenant-olmi'
const OUTRO_TENANT = 'tenant-vizinha'
const INQUILINO = 'pu-giane'
const PROPRIETARIO = 'pu-thiago'

function contractRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ct-1',
    tenant_id: TENANT,
    code: 'LOC-001',
    property_id: null,
    address_label: 'Rua Capitão Ramão Nunes, 1359',
    status: 'ativo',
    started_on: '2026-09-11',
    ends_on: '2027-09-11',
    rent_amount: 3000,
    due_day: 11,
    adjustment_index: 'IPCA-E',
    source: 'manual',
    created_at: '2026-09-11T12:00:00.000Z',
    updated_at: '2026-09-11T12:00:00.000Z',
    ...over,
  }
}

describe('listContracts (painel)', () => {
  test('toda query é escopada por tenant', () => {
    // Com service role não há RLS, e aí o filtro de tenant na query é a única
    // barreira entre uma imobiliária e os contratos da outra.
    const { client, calls } = fakeSupabase({ contracts: { data: [contractRow()], error: null } })
    return listContracts(client, TENANT).then(() => {
      const filtros = calls.filter((c) => c.method === 'eq')
      expect(filtros).toContainEqual(
        expect.objectContaining({ table: 'contracts', args: ['tenant_id', TENANT] }),
      )
    })
  })

  test('contrato de outro tenant não é devolvido pela consulta escopada', async () => {
    // O fake devolve o que o banco devolveria COM o filtro aplicado: nada.
    const { client } = fakeSupabase({ contracts: { data: [], error: null } })
    expect(await listContracts(client, OUTRO_TENANT)).toEqual([])
  })
})

describe('listContractsForClient', () => {
  test('devolve só os papéis DESTA pessoa, não os das outras partes', async () => {
    // O embed do PostgREST pode trazer as outras partes do mesmo contrato. Sem
    // refiltrar, a Giane receberia roles ['inquilino','proprietario'] porque o
    // Thiago também está no contrato — e passaria a ver o extrato de repasse.
    const { client } = fakeSupabase({
      contracts: {
        data: [
          contractRow({
            contract_parties: [
              { role: 'inquilino', portal_user_id: INQUILINO },
              { role: 'proprietario', portal_user_id: PROPRIETARIO },
            ],
          }),
        ],
        error: null,
      },
    })

    const [contrato] = await listContractsForClient(client, TENANT, INQUILINO)
    expect(contrato?.roles).toEqual(['inquilino'])
    expect(contrato?.roles).not.toContain('proprietario')
  })

  test('quem acumula papéis no mesmo contrato recebe os dois', async () => {
    const { client } = fakeSupabase({
      contracts: {
        data: [
          contractRow({
            contract_parties: [
              { role: 'proprietario', portal_user_id: INQUILINO },
              { role: 'inquilino', portal_user_id: INQUILINO },
            ],
          }),
        ],
        error: null,
      },
    })

    const [contrato] = await listContractsForClient(client, TENANT, INQUILINO)
    // Ordem canônica, não a ordem em que o banco devolveu.
    expect(contrato?.roles).toEqual(['inquilino', 'proprietario'])
  })

  test('contrato sem papel desta pessoa não aparece', async () => {
    const { client } = fakeSupabase({
      contracts: {
        data: [
          contractRow({
            contract_parties: [{ role: 'proprietario', portal_user_id: PROPRIETARIO }],
          }),
        ],
        error: null,
      },
    })
    expect(await listContractsForClient(client, TENANT, INQUILINO)).toEqual([])
  })

  test('a resposta do cliente não carrega nada interno', async () => {
    // `notes`, `admin_fee_percent` e `external_id` moram em contract_internal e
    // este caminho nem a lê. O que este teste trava é o resto: tenantId,
    // propertyId, source e adjustmentIndex são vocabulário da imobiliária.
    const { client } = fakeSupabase({
      contracts: {
        data: [
          contractRow({
            notes: 'cliente reclamou do vizinho',
            contract_parties: [{ role: 'inquilino', portal_user_id: INQUILINO }],
          }),
        ],
        error: null,
      },
    })

    const [contrato] = await listContractsForClient(client, TENANT, INQUILINO)
    const chaves = Object.keys(contrato ?? {})
    for (const proibida of [
      'notes',
      'tenantId',
      'propertyId',
      'source',
      'adjustmentIndex',
      'adminFeePercent',
      'externalId',
      'contract_parties',
    ]) {
      expect(chaves).not.toContain(proibida)
    }
    expect(chaves.sort()).toEqual(
      ['addressLabel', 'code', 'dueDay', 'endsOn', 'id', 'rentAmount', 'roles', 'startedOn', 'status'].sort(),
    )
  })
})

describe('getContractForClient', () => {
  test('id de contrato alheio devolve null, não o contrato', async () => {
    // Null tanto para "não existe" quanto para "não é seu": a resposta não pode
    // revelar que o contrato de outra pessoa existe.
    const { client } = fakeSupabase({ contracts: { data: null, error: null } })
    expect(await getContractForClient(client, TENANT, INQUILINO, 'ct-alheio')).toBeNull()
  })

  test('contrato encontrado mas sem papel desta pessoa devolve null', async () => {
    const { client } = fakeSupabase({
      contracts: {
        data: contractRow({
          contract_parties: [{ role: 'proprietario', portal_user_id: PROPRIETARIO }],
        }),
        error: null,
      },
    })
    expect(await getContractForClient(client, TENANT, INQUILINO, 'ct-1')).toBeNull()
  })
})
