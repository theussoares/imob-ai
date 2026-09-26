import { describe, expect, test } from 'vitest'
import { paraCliente, toCharge, toPaymentAccountView, toPayout, type ChargeRow } from '~~/server/mappers/cobranca.mapper'
import { createChargeDraft, deleteChargeDraft, markPayoutPaid } from '~~/server/repositories/cobranca.repository'
import { assertChargeCreateInput, assertManualSettlementInput, assertPaymentAccountInput } from '~~/server/utils/validate'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * A camada de dados da cobrança: o que o repository grava, o que o mapper
 * deixa sair e o que a validação barra na porta. As ameaças:
 *   - rascunho órfão de total zero ocupando o único "mensal" do mês;
 *   - cobrança emitida apagada (o boleto existiu, o registro some);
 *   - o inquilino vendo linha digitável de boleto cancelado, ou detalhe interno;
 *   - a chave do Asaas, ou o hash do segredo do webhook, chegando ao navegador;
 *   - sinal trocado num item virando cobrança a menos sem ninguém perceber.
 */

function row(over: Partial<ChargeRow> & Record<string, unknown> = {}): ChargeRow {
  return {
    id: 'ch1',
    contract_id: 'c1',
    kind: 'mensal',
    competence: '2026-09-01',
    due_on: '2099-10-10',
    issued_amount: 2400,
    issued_at: '2026-10-01T12:00:00Z',
    provider: 'asaas',
    provider_environment: 'sandbox',
    external_id: 'pay_123',
    payment_url: 'https://sandbox.asaas.com/i/123',
    bank_slip_url: 'https://sandbox.asaas.com/b/123',
    digitable_line: '0000',
    pix_copy_paste: '000201',
    fine_percent: 2,
    interest_monthly_percent: 1,
    canceled_at: null,
    cancel_reason: null,
    created_at: '2026-10-01T12:00:00Z',
    charge_items: [{ id: 'i1', kind: 'aluguel', description: null, amount: 2400 }],
    charge_settlements: [],
    ...over,
  } as ChargeRow
}

describe('createChargeDraft', () => {
  const nova = { kind: 'mensal' as const, competence: '2026-09-01', dueOn: '2026-10-10', items: [{ kind: 'aluguel' as const, description: null, amount: 2400 }] }

  test('segundo "mensal" do mesmo mês: 409 em português, sem tentar os itens', async () => {
    const { client, calls } = fakeSupabase({ contract_charges: { data: null, error: { code: '23505', message: 'dup' } } })
    await expect(createChargeDraft(client, 't1', 'c1', nova, 'u1')).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringMatching(/mensal deste mês/) })
    expect(calls.some((c) => c.table === 'charge_items')).toBe(false)
  })

  test('itens falharam: o cabeçalho recém-criado é apagado — só ele, e só se nunca foi emitido', async () => {
    const { client, calls } = fakeSupabase({
      contract_charges: [{ data: { id: 'ch-novo' }, error: null }, { data: null, error: null }],
      charge_items: { data: null, error: { message: 'queda' } },
    })
    await expect(createChargeDraft(client, 't1', 'c1', nova, 'u1')).rejects.toBeTruthy()
    const del = calls.filter((c) => c.table === 'contract_charges')
    expect(del.some((c) => c.method === 'delete')).toBe(true)
    const eqs = del.filter((c) => c.method === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['tenant_id', 't1'])
    expect(eqs).toContainEqual(['id', 'ch-novo'])
    expect(del.some((c) => c.method === 'is' && c.args[0] === 'issued_at')).toBe(true)
  })

  test('itens levam o tenant (a FK composta da 0041 exige)', async () => {
    const { client, calls } = fakeSupabase({ contract_charges: { data: { id: 'ch-novo' }, error: null }, charge_items: { data: null, error: null } })
    await createChargeDraft(client, 't1', 'c1', nova, 'u1')
    const itens = calls.find((c) => c.table === 'charge_items' && c.method === 'insert')!.args[0] as Record<string, unknown>[]
    expect(itens).toEqual([expect.objectContaining({ tenant_id: 't1', charge_id: 'ch-novo', amount: 2400 })])
  })
})

describe('deleteChargeDraft e markPayoutPaid: o filtro é a regra', () => {
  test('só apaga cobrança nunca emitida, e do tenant da sessão', async () => {
    const { client, calls } = fakeSupabase({ contract_charges: { data: [], error: null } })
    expect(await deleteChargeDraft(client, 't1', 'ch1')).toBe(false)
    expect(hadEq(calls, 'contract_charges', 'tenant_id')).toBe(true)
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'issued_at' && c.args[1] === null)).toBe(true)
  })

  test('repasse só é marcado pago uma vez, e nunca se cancelado', async () => {
    const { client, calls } = fakeSupabase({ owner_payouts: { data: [{ id: 'po1' }], error: null } })
    expect(await markPayoutPaid(client, 't1', 'po1')).toBe(true)
    expect(hadEq(calls, 'owner_payouts', 'tenant_id')).toBe(true)
    const is = calls.filter((c) => c.method === 'is').map((c) => c.args[0])
    expect(is).toEqual(expect.arrayContaining(['paid_at', 'canceled_at']))
  })
})

describe('toCharge', () => {
  test('numeric que chega como string vira número, e o total fecha em centavos', () => {
    const c = toCharge(
      row({
        issued_amount: '2400.10',
        charge_items: [
          { id: 'i1', kind: 'aluguel', description: null, amount: '2000.10' },
          { id: 'i2', kind: 'iptu', description: null, amount: '400.00' },
        ],
      }),
    )
    expect(c.issuedAmount).toBe(2400.1)
    expect(c.total).toBe(2400.1)
  })

  test('liquidações em ordem de data e estado derivado delas', () => {
    const c = toCharge(
      row({
        charge_settlements: [
          { id: 's2', amount: 400, settled_on: '2026-10-12', method: 'pix', created_by: null },
          { id: 's1', amount: 2000, settled_on: '2026-10-09', method: 'boleto', created_by: null },
        ],
      }),
    )
    expect(c.settlements.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(c.settledTotal).toBe(2400)
    expect(c.status).toBe('paga')
  })
})

describe('paraCliente — o recorte do inquilino', () => {
  test('rascunho e emissão em andamento não existem para ele', () => {
    expect(paraCliente(toCharge(row({ issued_amount: null, issued_at: null })))).toBeNull()
    expect(paraCliente(toCharge(row({ issued_amount: null })))).toBeNull()
  })

  test('boleto em aberto leva os meios de pagar', () => {
    const c = paraCliente(toCharge(row()))!
    expect(c).toMatchObject({ status: 'emitida', amount: 2400, digitableLine: '0000', pixCopyPaste: '000201' })
  })

  test('cancelada ou paga: sem link, sem linha, sem Pix (é convite a pagar o que não se deve)', () => {
    for (const r of [row({ canceled_at: '2026-10-02T00:00:00Z' }), row({ charge_settlements: [{ id: 's1', amount: 2400, settled_on: '2026-10-09', method: 'boleto', created_by: null }] })]) {
      const c = paraCliente(toCharge(r))!
      expect([c.paymentUrl, c.bankSlipUrl, c.digitableLine, c.pixCopyPaste]).toEqual([null, null, null, null])
    }
  })

  test('só as chaves do recorte: nada de provedor, id externo, itens ou liquidações', () => {
    const c = paraCliente(toCharge(row()))!
    expect(Object.keys(c).sort()).toEqual(['amount', 'bankSlipUrl', 'competence', 'digitableLine', 'dueOn', 'id', 'paymentUrl', 'pixCopyPaste', 'status'])
  })
})

describe('toPaymentAccountView — o que o navegador vê da conta', () => {
  test('sem a chave cifrada, sem o hash do segredo, sem os ids do webhook', () => {
    const v = toPaymentAccountView({
      tenant_id: 't1',
      provider: 'asaas',
      environment: 'producao',
      api_key_ciphertext: 'v1:iv:tag:dado',
      api_key_last4: 'ab12',
      account_name: 'Imobiliária Olmi',
      webhook_id: 'w1',
      webhook_secret_hash: 'hash',
      external_webhook_id: 'wh_1',
      connected_at: '2026-09-25T00:00:00Z',
    })
    expect(v).toEqual({ provider: 'asaas', environment: 'producao', apiKeyLast4: 'ab12', accountName: 'Imobiliária Olmi', connectedAt: '2026-09-25T00:00:00Z' })
  })
})

describe('toPayout', () => {
  test('líquido é o bruto menos a taxa; a taxa volta positiva para a tela', () => {
    const p = toPayout({
      id: 'po1',
      contract_id: 'c1',
      competence: '2026-09-01',
      scheduled_for: '2026-10-19',
      paid_at: null,
      canceled_at: null,
      payout_items: [
        { kind: 'bruto', amount: '2500.00', source_charge_id: 'ch1' },
        { kind: 'taxa_adm', amount: '-200.00', source_charge_id: 'ch1' },
      ],
    })
    expect(p).toMatchObject({ gross: 2500, adminFee: 200, net: 2300, status: 'pendente', sourceChargeId: 'ch1' })
  })

  test('cancelado vence pago no estado', () => {
    expect(toPayout({ id: 'p', contract_id: 'c', competence: '2026-09-01', scheduled_for: null, paid_at: 'x', canceled_at: 'y', payout_items: [] }).status).toBe('cancelado')
  })
})

describe('validação na porta', () => {
  const base = { competence: '2026-09', dueOn: '2026-10-10' }

  test('desconto é negativo; os outros itens, positivos', () => {
    expect(() => assertChargeCreateInput({ ...base, extras: [{ kind: 'desconto', amount: -100 }] })).not.toThrow()
    expect(() => assertChargeCreateInput({ ...base, extras: [{ kind: 'desconto', amount: 100 }] })).toThrow(/desconto é negativo/)
    expect(() => assertChargeCreateInput({ ...base, extras: [{ kind: 'condominio', amount: -500 }] })).toThrow(/positivo/)
  })

  test('mais de 2 casas decimais é recusado (o banco arredondaria calado)', () => {
    expect(() => assertChargeCreateInput({ ...base, rentAmount: 2400.005 })).toThrow(/2 casas/)
    expect(() => assertManualSettlementInput({ amount: 10.001, settledOn: '2026-09-01', method: 'pix' })).toThrow(/2 casas/)
  })

  test('item que só o sistema lança (multa, juros) não entra pela tela', () => {
    expect(() => assertChargeCreateInput({ ...base, extras: [{ kind: 'multa', amount: 10 }] })).toThrow(/Tipo de item/)
  })

  test('chave de um ambiente no outro: mensagem que diz qual é o problema', () => {
    // O Asaas só responderia 401, sem dizer que o erro é de ambiente.
    const sandbox = '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmU2'
    const producao = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmU2'
    expect(() => assertPaymentAccountInput({ provider: 'asaas', environment: 'producao', apiKey: sandbox })).toThrow(/chave de SANDBOX/)
    expect(() => assertPaymentAccountInput({ provider: 'asaas', environment: 'sandbox', apiKey: producao })).toThrow(/chave de PRODUÇÃO/)
    expect(() => assertPaymentAccountInput({ provider: 'asaas', environment: 'sandbox', apiKey: sandbox })).not.toThrow()
  })

  test('simulado só em sandbox: não existe "boleto de mentira" em produção', () => {
    expect(() => assertPaymentAccountInput({ provider: 'simulado', environment: 'producao' })).toThrow(/sandbox/)
  })
})
