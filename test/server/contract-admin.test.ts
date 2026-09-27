import { describe, expect, test } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'
import {
  addContractParty,
  createContract,
  listContractParties,
  removeContractParty,
  updateContract,
} from '~~/server/repositories/contract.repository'
import { assertContractInternalInput } from '~~/server/utils/validate'

const TENANT = 'tenant-olmi'
const OUTRO = 'tenant-vizinha'

/** O erro que o Postgres devolve quando o código já existe naquela imobiliária. */
const CODIGO_DUPLICADO = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "contracts_tenant_id_code_key"',
  details: null,
  hint: null,
}

const ENTRADA = {
  code: 'LOC-001',
  addressLabel: 'Rua Capitão Ramão Nunes, 1359',
  rentAmount: 3000,
  dueDay: 11,
}

describe('código de contrato repetido', () => {
  test('cadastrar com código já usado responde 409 dizendo qual é', async () => {
    // Mesmo tratamento do código de imóvel: sem ele o 23505 sobe como 500 sem
    // statusMessage, a tela cai no genérico "verifique os campos", e a pessoa
    // confere um cadastro inteiro certo menos o código.
    const { client } = fakeSupabase({ contracts: { data: null, error: CODIGO_DUPLICADO } })

    await expect(createContract(client, TENANT, ENTRADA)).rejects.toMatchObject({
      statusCode: 409,
    })
    await expect(createContract(client, TENANT, ENTRADA)).rejects.toMatchObject({
      statusMessage: expect.stringContaining('LOC-001'),
    })
  })

  test('editar com código já usado também é traduzido', async () => {
    const { client } = fakeSupabase({ contracts: { data: null, error: CODIGO_DUPLICADO } })
    await expect(updateContract(client, TENANT, 'ct-1', ENTRADA)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  test('outro erro do banco NÃO vira "código repetido"', async () => {
    // Dizer "código repetido" para um erro que não é esse manda a pessoa mexer
    // no campo errado e esconde o problema de verdade.
    const outroErro = { code: '23503', message: 'foreign key violation' }
    const { client } = fakeSupabase({ contracts: { data: null, error: outroErro } })
    await expect(createContract(client, TENANT, ENTRADA)).rejects.toMatchObject({
      code: '23503',
    })
  })
})

describe('partes do contrato', () => {
  test('vincular exige que contrato E cliente sejam do mesmo tenant', async () => {
    // `contract_parties` não tem tenant_id: a tabela sozinha aceitaria ligar o
    // contrato de uma imobiliária ao cliente de outra, e aquela pessoa passaria
    // a enxergar documentos que não são dela.
    const { client } = fakeSupabase({
      contracts: { data: { id: 'ct-1' }, error: null },
      portal_users: { data: null, error: null },
    })

    await expect(
      addContractParty(client, TENANT, 'ct-1', 'pu-de-outro-tenant', 'inquilino'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  test('contrato inexistente no tenant não aceita parte', async () => {
    const { client } = fakeSupabase({
      contracts: { data: null, error: null },
      portal_users: { data: { id: 'pu-1' }, error: null },
    })
    await expect(
      addContractParty(client, OUTRO, 'ct-alheio', 'pu-1', 'inquilino'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  test('vínculo repetido não é erro — é clique repetido', async () => {
    const duplicado = { code: '23505', message: 'duplicate key' }
    const { client } = fakeSupabase({
      contracts: { data: { id: 'ct-1' }, error: null },
      portal_users: { data: { id: 'pu-1' }, error: null },
      contract_parties: { data: null, error: duplicado },
    })
    await expect(
      addContractParty(client, TENANT, 'ct-1', 'pu-1', 'inquilino'),
    ).resolves.toBeUndefined()
  })

  test('remover parte exige contrato do tenant', async () => {
    const { client } = fakeSupabase({ contracts: { data: null, error: null } })
    await expect(
      removeContractParty(client, OUTRO, 'ct-alheio', 'parte-1'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  test('listar partes filtra o embed pelo tenant', async () => {
    const { client, calls } = fakeSupabase({
      contract_parties: {
        data: [
          {
            id: 'p1',
            role: 'inquilino',
            portal_user_id: 'pu-1',
            portal_users: { name: 'Giane', email: 'g@x.com', active: true },
          },
        ],
        error: null,
      },
    })

    const partes = await listContractParties(client, TENANT, 'ct-1')
    expect(partes[0]).toMatchObject({ nome: 'Giane', role: 'inquilino', ativo: true })

    // Sem este filtro, um id de contrato de outra imobiliária devolveria as
    // partes dela — a tabela de vínculos não tem coluna de tenant.
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['portal_users.tenant_id', TENANT])
  })
})

describe('assertContractInternalInput', () => {
  test('taxa de administração fora de 0..100 é recusada com mensagem', () => {
    // Mesma constraint da 0028, adiantada para não virar erro do Postgres numa
    // tela de cadastro.
    expect(() => assertContractInternalInput({ adminFeePercent: -1 })).toThrow()
    expect(() => assertContractInternalInput({ adminFeePercent: 101 })).toThrow()
    expect(() => assertContractInternalInput({ adminFeePercent: 10 })).not.toThrow()
    expect(() => assertContractInternalInput({ adminFeePercent: null })).not.toThrow()
  })
})

// BUG-FUN-01 (teste de 27/09): apagar multa ou juros no assistente derrubava a
// criação do contrato com 500. O `<input v-model.number>` apagado manda `""`, o
// validador deixava passar e o Postgres recusava ("invalid input syntax for
// type numeric"). Justo o caso que a spec 4B manda aceitar como pendência.
describe('campo numérico apagado na tela', () => {
  test('vira null na linha do banco, e não "" que o Postgres recusa', async () => {
    const { toContractInternalRow, toContractRow } = await import('~~/server/mappers/contract.mapper')
    const interno = toContractInternalRow(
      {
        adminFeePercent: '' as unknown as number,
        finePercent: '' as unknown as number,
        interestMonthlyPercent: ' ' as unknown as number,
        rentFeePercent: '' as unknown as number,
        payoutBusinessDays: '' as unknown as number,
        guaranteeAmount: '' as unknown as number,
      },
      'contrato-1',
    )
    expect(interno).toMatchObject({
      admin_fee_percent: null,
      fine_percent: null,
      interest_monthly_percent: null,
      rent_fee_percent: null,
      payout_business_days: null,
      guarantee_amount: null,
    })
    expect(toContractRow({ ...ENTRADA, termMonths: '' as unknown as number }, TENANT)).toMatchObject({ term_months: null })
  })

  test('campo que não veio continua de fora, para a edição não zerar o que outra tela gravou', async () => {
    const { toContractInternalRow } = await import('~~/server/mappers/contract.mapper')
    expect(toContractInternalRow({ finePercent: 2 }, 'contrato-1')).not.toHaveProperty('interest_monthly_percent')
  })

  test('o validador aceita o campo apagado', () => {
    expect(() => assertContractInternalInput({ finePercent: '', interestMonthlyPercent: '', payoutBusinessDays: '', guaranteeAmount: '' })).not.toThrow()
  })
})
