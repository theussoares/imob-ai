import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  assertLeaseCreateInput,
  assertPortalUserInput,
} from '~~/server/utils/validate'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Contrato de locação (0050). As ameaças e os erros caros:
 *   - duas garantias no mesmo contrato (nulo por lei, art. 37);
 *   - caução acima de 3 aluguéis (art. 38);
 *   - imóvel ou pessoa de OUTRA imobiliária entrando pelo body;
 *   - contrato pela metade no banco quando uma etapa falha;
 *   - convite (token de sessão) saindo para quem só foi cadastrado.
 */

const UUID = '3f0c1f8e-5d7a-4b8e-9a51-2f6d0c7e9b11'
const base = {
  addressLabel: 'Rua Paranaíba, 1450',
  inquilino: { nova: { name: 'Helena Martins', phone: '5567981112233', doc: '52998224725' } },
  rentAmount: 2400,
  dueDay: 10,
  startedOn: '2026-10-01',
}

describe('validação do assistente', () => {
  test('o mínimo para existir: endereço, inquilino, aluguel, vencimento e início', () => {
    expect(() => assertLeaseCreateInput(base)).not.toThrow()
    expect(() => assertLeaseCreateInput({ ...base, inquilino: undefined })).toThrow(/inquilino/)
    expect(() => assertLeaseCreateInput({ ...base, rentAmount: 0 })).toThrow(/aluguel/)
  })

  test('caução até 3 aluguéis (Lei 8.245, art. 38)', () => {
    expect(() => assertLeaseCreateInput({ ...base, guaranteeType: 'caucao', guaranteeAmount: 7200 })).not.toThrow()
    expect(() => assertLeaseCreateInput({ ...base, guaranteeType: 'caucao', guaranteeAmount: 7201 })).toThrow(/3 aluguéis/)
  })

  test('uma garantia só (art. 37): fiador exige a garantia "Fiador", e lista é recusada', () => {
    const fiador = { nova: { name: 'Sérgio Batista' } }
    expect(() => assertLeaseCreateInput({ ...base, guaranteeType: 'caucao', fiador })).toThrow(/duas garantias/)
    expect(() => assertLeaseCreateInput({ ...base, guaranteeType: 'fiador', fiador })).not.toThrow()
    expect(() => assertLeaseCreateInput({ ...base, guaranteeType: ['fiador', 'caucao'] })).toThrow()
  })

  test('multa acima de 10% e juros acima de 1% a.m. são recusados antes do banco', () => {
    expect(() => assertLeaseCreateInput({ ...base, finePercent: 10.5 })).toThrow(/10%/)
    expect(() => assertLeaseCreateInput({ ...base, interestMonthlyPercent: 2 })).toThrow(/1%/)
  })

  test('CPF que não fecha o dígito é recusado no cadastro, não no dia do boleto', () => {
    expect(() =>
      assertLeaseCreateInput({ ...base, inquilino: { nova: { name: 'X', doc: '529.982.247-24' } } }),
    ).toThrow(/CPF\/CNPJ inválido/)
  })

  test('repasse sem proprietário, ou com titular sem documento válido, é recusado', () => {
    const pix = { kind: 'pix', pixKeyType: 'cpf', pixKey: '52998224725', holderName: 'Sérgio', holderDoc: '52998224725' }
    expect(() => assertLeaseCreateInput({ ...base, repasse: pix })).toThrow(/proprietário/)
    const comDono = { ...base, proprietario: { id: UUID } }
    expect(() => assertLeaseCreateInput({ ...comDono, repasse: pix })).not.toThrow()
    expect(() => assertLeaseCreateInput({ ...comDono, repasse: { ...pix, holderDoc: '123' } })).toThrow(/titular/)
  })

  test('cadastro de cliente: e-mail só é obrigatório para convidar', () => {
    expect(() => assertPortalUserInput({ name: 'Fiador sem e-mail', phone: '5567981112233' })).not.toThrow()
    expect(() => assertPortalUserInput({ name: 'X', convidar: true })).toThrow(/e-mail/)
  })
})

describe('criarLocacao', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function carregar() {
    vi.stubGlobal('logWarn', () => {})
    vi.stubGlobal('invalidateTenantCache', async () => {})
    vi.stubGlobal('serviceSupabase', () => {
      throw new Error('service_role não deveria ser usada sem convite')
    })
    return (await import('~~/server/utils/locacao')).criarLocacao
  }
  const tenant = { id: 't1', slug: 'olmi', name: 'OLMI', email: null } as never

  test('imóvel de outra imobiliária é recusado antes de criar qualquer coisa', async () => {
    const criarLocacao = await carregar()
    const { client, calls } = fakeSupabase({ properties: { data: null, error: null } })
    await expect(criarLocacao(client, tenant, { ...base, propertyId: UUID } as never, 'u1')).rejects.toMatchObject({ statusCode: 422 })
    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  test('pessoa da carteira de outra imobiliária também', async () => {
    const criarLocacao = await carregar()
    const { client, calls } = fakeSupabase({ portal_users: { data: null, error: null } })
    await expect(criarLocacao(client, tenant, { ...base, inquilino: { id: UUID } } as never, 'u1')).rejects.toMatchObject({ statusCode: 422 })
    expect(hadEq(calls, 'portal_users', 'tenant_id')).toBe(true)
    expect(calls.some((c) => c.table === 'contracts' && c.method === 'insert')).toBe(false)
  })

  test('etapa que falha depois do contrato existir apaga o contrato (compensação)', async () => {
    const criarLocacao = await carregar()
    const pessoa = { id: 'pu1', tenant_id: 't1', user_id: null, name: 'Helena', email: null, doc: null, phone: null, active: true, access_confirmed_at: null, created_at: '', updated_at: '', last_recovery_at: null }
    const contrato = { id: 'c1', tenant_id: 't1', code: 'LOC-2026-001', property_id: null, address_label: 'Rua', status: 'ativo', started_on: '2026-10-01', ends_on: null, rent_amount: 2400, due_day: 10, adjustment_index: null, term_months: null, guarantee_type: null, source: 'manual', created_at: '', updated_at: '' }
    const { client, calls } = fakeSupabase({
      portal_users: { data: pessoa, error: null },
      contracts: [{ data: [], error: null }, { data: contrato, error: null }, { data: null, error: null }],
      contract_internal: { data: null, error: { message: 'boom' } },
    })
    await expect(criarLocacao(client, tenant, base as never, 'u1')).rejects.toBeTruthy()
    const del = calls.filter((c) => c.table === 'contracts' && c.method === 'delete')
    expect(del).toHaveLength(1)
    expect(hadEq(calls, 'contracts', 'tenant_id')).toBe(true)
  })

  test('pessoa nova nasce SEM acesso — nenhum convite sem pedido explícito', async () => {
    const criarLocacao = await carregar()
    const pessoa = { id: 'pu1', tenant_id: 't1', user_id: null, name: 'Helena', email: 'h@x.com', doc: null, phone: null, active: true, access_confirmed_at: null, created_at: '', updated_at: '', last_recovery_at: null }
    const contrato = { id: 'c1', tenant_id: 't1', code: 'LOC-2026-001', property_id: null, address_label: 'Rua', status: 'ativo', started_on: '2026-10-01', ends_on: null, rent_amount: 2400, due_day: 10, adjustment_index: null, term_months: null, guarantee_type: null, source: 'manual', created_at: '', updated_at: '' }
    const { client, calls } = fakeSupabase({
      portal_users: { data: pessoa, error: null },
      contracts: [{ data: [], error: null }, { data: contrato, error: null }, { data: { id: 'c1' }, error: null }],
      contract_internal: { data: { contract_id: 'c1' }, error: null },
      contract_parties: { data: null, error: null },
    })
    const r = await criarLocacao(client, tenant, base as never, 'u1')
    expect(r.convites).toEqual([])
    const ins = calls.find((c) => c.table === 'portal_users' && c.method === 'insert')!.args[0] as Record<string, unknown>
    expect(ins.user_id).toBeNull()
    expect(ins.tenant_id).toBe('t1')
  })

  test('destino do repasse grava pela service_role, não pelo client do membro (0042)', async () => {
    // O bug que isto trava: a 0042 revogou insert/update das tabelas
    // financeiras do `authenticated`. Gravando com o client do membro, o banco
    // devolvia 42501 e a compensação apagava o contrato recém-criado — todo
    // contrato com Pix do proprietário falhava em produção.
    vi.stubGlobal('logWarn', () => {})
    vi.stubGlobal('invalidateTenantCache', async () => {})
    const service = fakeSupabase({ payout_destinations: { data: null, error: null } })
    vi.stubGlobal('serviceSupabase', () => service.client)
    const { criarLocacao } = await import('~~/server/utils/locacao')
    const pessoa = { id: 'pu1', tenant_id: 't1', user_id: null, name: 'Sérgio', email: null, doc: null, phone: null, active: true, access_confirmed_at: null, created_at: '', updated_at: '', last_recovery_at: null }
    const contrato = { id: 'c1', tenant_id: 't1', code: 'LOC-2026-001', property_id: null, address_label: 'Rua', status: 'ativo', started_on: '2026-10-01', ends_on: null, rent_amount: 2400, due_day: 10, adjustment_index: null, term_months: null, guarantee_type: null, source: 'manual', created_at: '', updated_at: '' }
    const membro = fakeSupabase({
      portal_users: { data: pessoa, error: null },
      contracts: [{ data: [], error: null }, { data: contrato, error: null }, { data: { id: 'c1' }, error: null }, { data: { id: 'c1' }, error: null }],
      contract_internal: { data: { contract_id: 'c1' }, error: null },
      contract_parties: { data: null, error: null },
      payout_destinations: { data: null, error: { code: '42501', message: 'permission denied' } },
    })
    const repasse = { kind: 'pix', pixKeyType: 'cpf', pixKey: '52998224725', holderName: 'Sérgio', holderDoc: '52998224725' }
    await criarLocacao(membro.client, tenant, { ...base, proprietario: { id: UUID }, repasse } as never, 'u1')
    expect(membro.calls.some((c) => c.table === 'payout_destinations')).toBe(false)
    expect(hadEq(service.calls, 'payout_destinations', 'tenant_id')).toBe(true)
    expect(service.calls.some((c) => c.table === 'payout_destinations' && c.method === 'insert')).toBe(true)
  })
})
