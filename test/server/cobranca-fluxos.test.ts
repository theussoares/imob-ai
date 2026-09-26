import { afterEach, describe, expect, test, vi } from 'vitest'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Os fluxos de dinheiro de `server/utils/cobranca.ts` que o `cobranca.test.ts`
 * não cobre: cancelar, baixa manual, repasse e os eventos do webhook além do
 * "pago". As ameaças, em ordem de custo:
 *   - boleto cancelado aqui e pagável lá (o inquilino paga e nada baixa);
 *   - baixa manual parcial com boleto vivo (o inquilino paga as duas coisas);
 *   - baixa manual e webhook do mesmo pagamento virando DUAS liquidações;
 *   - repasse em dobro, ou com taxa de administração sobre condomínio;
 *   - estorno do provedor ignorado (o proprietário recebe o que voltou).
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('~~/server/services/payments/simulado')
})

const tenant = { id: 't1', slug: 'olmi' } as never

function chargeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ch1',
    contract_id: 'c1',
    kind: 'mensal',
    competence: '2026-09-01',
    due_on: '2099-10-10',
    issued_amount: 2400,
    issued_at: '2026-10-01T12:00:00Z',
    provider: 'simulado',
    provider_environment: 'sandbox',
    external_id: 'pay_123',
    payment_url: null,
    bank_slip_url: null,
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
  }
}
const liquidacao = (over: Record<string, unknown> = {}) => ({ id: 's1', amount: 2400, settled_on: '2026-10-09', method: 'boleto', created_by: null, ...over })
const rascunhoRow = chargeRow({ issued_amount: null, issued_at: null, provider: null, provider_environment: null, external_id: null })
const conta = { tenant_id: 't1', provider: 'simulado', environment: 'sandbox', api_key_ciphertext: null, api_key_last4: null, account_name: null, webhook_id: 'w', webhook_secret_hash: null, external_webhook_id: null, connected_at: '' }

/** Provedor simulado com as operações espionadas. Precisa vir ANTES do import de `cobranca`. */
function provedorFalso(over: Record<string, unknown> = {}) {
  const p = {
    cancelar: vi.fn(async () => {}),
    baixarPorFora: vi.fn(async () => {}),
    ...over,
  }
  vi.doMock('~~/server/services/payments/simulado', () => ({ criarSimulado: () => ({ nome: 'simulado', ambiente: 'sandbox', ...p }) }))
  return p
}

/**
 * A classe do erro vem do MESMO registro de módulos que `cobranca` vai usar:
 * depois de `vi.resetModules()`, um `ErroDoProvedor` importado no topo do
 * arquivo é outra classe, e o `instanceof` de `comoErroHttp` não o reconhece.
 */
async function erroDoProvedor(msg: string, credencialInvalida = false) {
  const { ErroDoProvedor } = await import('~~/server/services/payments/provider')
  return new ErroDoProvedor(msg, credencialInvalida)
}

async function carregar(service: ReturnType<typeof fakeSupabase>) {
  vi.stubGlobal('serviceSupabase', () => service.client)
  vi.stubGlobal('decifrar', (s: string) => s)
  return import('~~/server/utils/cobranca')
}

const escritas = (calls: ReturnType<typeof fakeSupabase>['calls'], table: string, method: string) =>
  calls.filter((c) => c.table === table && c.method === method)

describe('cancelarCobranca', () => {
  test('cancela NO PROVEDOR antes de marcar aqui', async () => {
    const service = fakeSupabase({
      tenant_payment_accounts: { data: conta, error: null },
      contract_charges: [{ data: null, error: null }, { data: chargeRow({ canceled_at: '2026-10-02T00:00:00Z' }), error: null }],
    })
    let escritasAntesDoProvedor = -1
    const p = provedorFalso({
      cancelar: vi.fn(async () => {
        escritasAntesDoProvedor = escritas(service.calls, 'contract_charges', 'update').length
      }),
    })
    const { cancelarCobranca } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: chargeRow(), error: null } })

    const r = await cancelarCobranca(membro.client, tenant, 'ch1', '  inquilino saiu  ', 'u1')

    expect(p.cancelar).toHaveBeenCalledWith('pay_123')
    expect(escritasAntesDoProvedor).toBe(0)
    const upd = escritas(service.calls, 'contract_charges', 'update')[0]!.args[0] as Record<string, unknown>
    expect(upd).toMatchObject({ canceled_by: 'u1', cancel_reason: 'inquilino saiu' })
    expect(hadEq(service.calls, 'contract_charges', 'tenant_id')).toBe(true)
    expect(r.status).toBe('cancelada')
  })

  test('provedor falhou: nada muda aqui, e o erro dele sobe em português', async () => {
    const service = fakeSupabase({ tenant_payment_accounts: { data: conta, error: null } })
    provedorFalso({ cancelar: vi.fn(async () => { throw await erroDoProvedor('Boleto já pago no Asaas.') }) })
    const { cancelarCobranca } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: chargeRow(), error: null } })

    await expect(cancelarCobranca(membro.client, tenant, 'ch1', null, 'u1')).rejects.toMatchObject({ statusCode: 502, statusMessage: 'Boleto já pago no Asaas.' })
    expect(escritas(service.calls, 'contract_charges', 'update')).toHaveLength(0)
  })

  test('com pagamento registrado: recusa e manda estornar, sem tocar o provedor', async () => {
    const service = fakeSupabase({})
    const p = provedorFalso()
    const { cancelarCobranca } = await carregar(service)
    for (const s of [[liquidacao()], [liquidacao({ amount: 1000 })]]) {
      const membro = fakeSupabase({ contract_charges: { data: chargeRow({ charge_settlements: s }), error: null } })
      await expect(cancelarCobranca(membro.client, tenant, 'ch1', null, 'u1')).rejects.toMatchObject({ statusCode: 422, statusMessage: expect.stringMatching(/estorno/) })
    }
    expect(p.cancelar).not.toHaveBeenCalled()
    expect(service.calls).toHaveLength(0)
  })

  test('boleto de OUTRA conta (trocou de ambiente): 409, em vez de cancelar só aqui', async () => {
    // Cancelar só aqui deixaria o boleto do sandbox pagável e sem dono.
    const service = fakeSupabase({ tenant_payment_accounts: { data: { ...conta, environment: 'producao' }, error: null } })
    const p = provedorFalso()
    const { cancelarCobranca } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: chargeRow(), error: null } })

    await expect(cancelarCobranca(membro.client, tenant, 'ch1', null, 'u1')).rejects.toMatchObject({ statusCode: 409 })
    expect(p.cancelar).not.toHaveBeenCalled()
    expect(escritas(service.calls, 'contract_charges', 'update')).toHaveLength(0)
  })

  test('emissão em andamento há menos de 5 min: espera; trava parada há mais: libera', async () => {
    const service = fakeSupabase({ contract_charges: [{ data: null, error: null }, { data: chargeRow(), error: null }] })
    provedorFalso()
    const { cancelarCobranca } = await carregar(service)
    const emitindo = (min: number) =>
      chargeRow({ issued_amount: null, provider: null, external_id: null, issued_at: new Date(Date.now() - min * 60_000).toISOString() })

    const agora = fakeSupabase({ contract_charges: { data: emitindo(1), error: null } })
    await expect(cancelarCobranca(agora.client, tenant, 'ch1', null, 'u1')).rejects.toMatchObject({ statusCode: 409 })
    expect(escritas(service.calls, 'contract_charges', 'update')).toHaveLength(0)

    const parada = fakeSupabase({ contract_charges: { data: emitindo(10), error: null } })
    await cancelarCobranca(parada.client, tenant, 'ch1', null, 'u1')
    expect(escritas(service.calls, 'contract_charges', 'update')).toHaveLength(1)
  })

  test('cobrança de outro tenant: 404 (a leitura do membro não a acha)', async () => {
    const service = fakeSupabase({})
    provedorFalso()
    const { cancelarCobranca } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: null, error: null } })
    await expect(cancelarCobranca(membro.client, tenant, 'ch-alheia', null, 'u1')).rejects.toMatchObject({ statusCode: 404 })
    expect(hadEq(membro.calls, 'contract_charges', 'tenant_id')).toBe(true)
    expect(service.calls).toHaveLength(0)
  })
})

describe('baixarManualmente', () => {
  const pix = { amount: 2400, settledOn: '2026-09-01', method: 'pix' as const }

  test('com boleto vivo, baixa PARCIAL é recusada antes do provedor', async () => {
    // Aceitar deixaria o boleto pagável pelo valor cheio: o inquilino que
    // paga o boleto depois pagou em dobro.
    const service = fakeSupabase({})
    const p = provedorFalso()
    const { baixarManualmente } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: chargeRow(), error: null } })

    await expect(baixarManualmente(membro.client, tenant, 'ch1', { ...pix, amount: 1000 }, 'u1')).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: expect.stringContaining('R$ 2400,00'),
    })
    expect(p.baixarPorFora).not.toHaveBeenCalled()
    expect(service.calls).toHaveLength(0)
  })

  test('com boleto vivo: baixa lá e usa a MESMA chave do webhook (um pagamento, uma liquidação)', async () => {
    // O provedor avisa a baixa em dinheiro por webhook, e ele pode chegar
    // antes ou depois desta linha. Com a mesma chave, quem chegar segundo
    // colide no índice único e vira no-op.
    const service = fakeSupabase({
      tenant_payment_accounts: { data: conta, error: null },
      charge_settlements: { data: null, error: null },
      contract_charges: { data: chargeRow(), error: null },
    })
    const p = provedorFalso()
    const { baixarManualmente } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: chargeRow(), error: null } })

    await baixarManualmente(membro.client, tenant, 'ch1', pix, 'u1')

    expect(p.baixarPorFora).toHaveBeenCalledWith('pay_123', 2400, '2026-09-01')
    const ins = escritas(service.calls, 'charge_settlements', 'insert')[0]!.args[0] as Record<string, unknown>
    expect(ins).toMatchObject({ tenant_id: 't1', idempotency_key: 'simulado:pago:pay_123', method: 'pix', created_by: 'u1' })
  })

  test('provedor recusou a baixa: nenhuma liquidação aqui', async () => {
    const service = fakeSupabase({ tenant_payment_accounts: { data: conta, error: null } })
    provedorFalso({ baixarPorFora: vi.fn(async () => { throw await erroDoProvedor('Chave revogada.', true) }) })
    const { baixarManualmente } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: chargeRow(), error: null } })

    await expect(baixarManualmente(membro.client, tenant, 'ch1', pix, 'u1')).rejects.toMatchObject({ statusCode: 409 })
    expect(escritas(service.calls, 'charge_settlements', 'insert')).toHaveLength(0)
  })

  test('rascunho recebido por fora: congela o total emitido e aceita parcial, sem chave de provedor', async () => {
    const service = fakeSupabase({ contract_charges: { data: null, error: null }, charge_settlements: { data: null, error: null } })
    const p = provedorFalso()
    const { baixarManualmente } = await carregar(service)
    const membro = fakeSupabase({ contract_charges: { data: rascunhoRow, error: null } })

    await baixarManualmente(membro.client, tenant, 'ch1', { ...pix, amount: 1000, method: 'dinheiro' as const }, 'u1')

    expect(p.baixarPorFora).not.toHaveBeenCalled()
    const congela = escritas(service.calls, 'contract_charges', 'update')[0]!.args[0] as Record<string, unknown>
    expect(congela.issued_amount).toBe(2400)
    // Só congela se ninguém emitiu no meio tempo.
    expect(escritas(service.calls, 'contract_charges', 'is').map((c) => c.args[0])).toContain('issued_at')
    const ins = escritas(service.calls, 'charge_settlements', 'insert')[0]!.args[0] as Record<string, unknown>
    expect(ins).toMatchObject({ amount: 1000, idempotency_key: null })
  })

  test('data futura, cobrança cancelada ou já paga: 422 sem escrever nada', async () => {
    const service = fakeSupabase({})
    provedorFalso()
    const { baixarManualmente } = await carregar(service)
    const casos: [Record<string, unknown>, typeof pix][] = [
      [chargeRow(), { ...pix, settledOn: '2999-01-01' }],
      [chargeRow({ canceled_at: '2026-10-02T00:00:00Z' }), pix],
      [chargeRow({ charge_settlements: [liquidacao()] }), pix],
    ]
    for (const [row, input] of casos) {
      const membro = fakeSupabase({ contract_charges: { data: row, error: null } })
      await expect(baixarManualmente(membro.client, tenant, 'ch1', input, 'u1')).rejects.toMatchObject({ statusCode: 422 })
    }
    expect(service.calls).toHaveLength(0)
  })
})

describe('gerarRepasseSeQuitada', () => {
  const contrato = { id: 'c1', tenant_id: 't1', code: 'LOC-1', property_id: null, address_label: 'Rua A', status: 'ativo', started_on: '2026-01-01', ends_on: null, rent_amount: 2000, due_day: 10, adjustment_index: null, term_months: null, guarantee_type: null, source: 'manual', created_at: '', updated_at: '' }
  const interno = { contract_id: 'c1', notes: null, admin_fee_percent: 10, external_id: null, payout_business_days: 5 }
  const dono = { id: 'p2', role: 'proprietario', portal_user_id: 'pu-dono', portal_users: { name: 'Seu Jorge', email: null, active: true, doc: null, phone: null, user_id: null, tenant_id: 't1' } }
  // Aluguel + condomínio pagos na sexta 09/10/2026.
  const paga = chargeRow({
    charge_items: [
      { id: 'i1', kind: 'aluguel', description: null, amount: 2000 },
      { id: 'i2', kind: 'condominio', description: null, amount: 500 },
    ],
    issued_amount: 2500,
    charge_settlements: [liquidacao({ amount: 2500 })],
  })

  function banco(over: Record<string, unknown> = {}) {
    return fakeSupabase({
      contract_charges: { data: paga, error: null },
      contracts: { data: contrato, error: null },
      contract_internal: { data: interno, error: null },
      contract_parties: { data: [dono], error: null },
      payout_destinations: { data: { id: 'dest1' }, error: null },
      owner_payouts: { data: { id: 'po1' }, error: null },
      payout_items: { data: null, error: null },
      ...over,
    } as never)
  }

  test('paga: repasse com taxa SÓ sobre o aluguel, destino ativo e prazo em dias úteis', async () => {
    const service = banco()
    const { gerarRepasseSeQuitada } = await carregar(service)
    expect(await gerarRepasseSeQuitada(service.client, 't1', 'ch1')).toBe('criado')

    const cab = escritas(service.calls, 'owner_payouts', 'insert')[0]!.args[0] as Record<string, unknown>
    // 09/10 é sexta, 12/10 é feriado nacional: 13, 14, 15, 16, 19.
    expect(cab).toMatchObject({ tenant_id: 't1', contract_id: 'c1', competence: '2026-09-01', destination_id: 'dest1', scheduled_for: '2026-10-19', idempotency_key: 'cobranca:ch1' })
    const itens = escritas(service.calls, 'payout_items', 'insert')[0]!.args[0] as Record<string, unknown>[]
    expect(itens.map((i) => [i.kind, i.amount])).toEqual([['bruto', 2500], ['taxa_adm', -200]])
    expect(itens.every((i) => i.tenant_id === 't1' && i.source_charge_id === 'ch1')).toBe(true)
  })

  test('o contrato é lido COM o tenant antes do contract_internal (que não tem tenant)', async () => {
    const service = banco()
    const { gerarRepasseSeQuitada } = await carregar(service)
    await gerarRepasseSeQuitada(service.client, 't1', 'ch1')
    expect(hadEq(service.calls, 'contracts', 'tenant_id')).toBe(true)
    const ordem = service.calls.map((c) => c.table)
    expect(ordem.indexOf('contracts')).toBeLessThan(ordem.indexOf('contract_internal'))
  })

  test('mesma cobrança processada duas vezes: o segundo repasse colide e não cria itens', async () => {
    const service = banco({ owner_payouts: { data: null, error: { code: '23505', message: 'dup' } } })
    const { gerarRepasseSeQuitada } = await carregar(service)
    expect(await gerarRepasseSeQuitada(service.client, 't1', 'ch1')).toBe('duplicado')
    expect(escritas(service.calls, 'payout_items', 'insert')).toHaveLength(0)
  })

  test('parcial ou sem proprietário: nenhum repasse', async () => {
    const parcial = banco({ contract_charges: { data: chargeRow({ charge_settlements: [liquidacao({ amount: 100 })] }), error: null } })
    const m1 = await carregar(parcial)
    expect(await m1.gerarRepasseSeQuitada(parcial.client, 't1', 'ch1')).toBe('nao_quitada')
    expect(escritas(parcial.calls, 'owner_payouts', 'insert')).toHaveLength(0)
    vi.resetModules()

    const semDono = banco({ contract_parties: { data: [], error: null } })
    const m2 = await carregar(semDono)
    expect(await m2.gerarRepasseSeQuitada(semDono.client, 't1', 'ch1')).toBe('sem_proprietario')
    expect(escritas(semDono.calls, 'owner_payouts', 'insert')).toHaveLength(0)
  })

  test('itens do repasse falharam: o cabeçalho é apagado, para o reenvio recriar inteiro', async () => {
    // Cabeçalho sem itens é repasse de R$ 0 — e a chave de idempotência
    // impediria o reenvio do webhook de consertar.
    const service = banco({ payout_items: { data: null, error: { message: 'queda' } } })
    const { gerarRepasseSeQuitada } = await carregar(service)
    await expect(gerarRepasseSeQuitada(service.client, 't1', 'ch1')).rejects.toBeTruthy()
    expect(escritas(service.calls, 'owner_payouts', 'delete')).toHaveLength(1)
    const eqs = escritas(service.calls, 'owner_payouts', 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['tenant_id', 't1'])
    expect(eqs).toContainEqual(['id', 'po1'])
  })
})

describe('processarEventoDePagamento — além do "pago"', () => {
  const evento = { eventId: 'evt_9', tipo: 'pago' as const, bruto: 'PAYMENT_RECEIVED', externalId: 'pay_123', valor: 2400, data: '2026-10-09', metodo: 'boleto' as const, emDinheiro: false }
  const diario = { payment_webhook_events: { data: null, error: null } }

  test('estornado: uma linha NEGATIVA por liquidação, apontando para a original', async () => {
    const service = fakeSupabase({
      ...diario,
      contract_charges: { data: chargeRow({ charge_settlements: [liquidacao({ id: 's1', amount: 1400 }), liquidacao({ id: 's2', amount: 1000, settled_on: '2026-10-10' })] }), error: null },
      charge_settlements: { data: null, error: null },
    })
    const { processarEventoDePagamento } = await carregar(service)
    const r = await processarEventoDePagamento(service.client, 't1', 'asaas', { ...evento, tipo: 'estornado', bruto: 'PAYMENT_REFUNDED', data: '2026-10-20' })

    expect(r).toBe('estornada')
    const linhas = escritas(service.calls, 'charge_settlements', 'insert').map((c) => c.args[0] as Record<string, unknown>)
    expect(linhas).toEqual([
      expect.objectContaining({ tenant_id: 't1', amount: -1400, reverses_settlement_id: 's1', settled_on: '2026-10-20', idempotency_key: 'asaas:estorno:pay_123:s1' }),
      expect.objectContaining({ amount: -1000, reverses_settlement_id: 's2', idempotency_key: 'asaas:estorno:pay_123:s2' }),
    ])
  })

  test('estorno reenviado: colide no índice e não soma de novo', async () => {
    const service = fakeSupabase({
      ...diario,
      contract_charges: { data: chargeRow({ charge_settlements: [liquidacao()] }), error: null },
      charge_settlements: { data: null, error: { code: '23505', message: 'dup' } },
    })
    const { processarEventoDePagamento } = await carregar(service)
    expect(await processarEventoDePagamento(service.client, 't1', 'asaas', { ...evento, eventId: 'evt_10', tipo: 'estornado' })).toBe('estorno_ja_registrado')
  })

  test('pago numa cobrança CANCELADA: registra o dinheiro, mas não gera repasse', async () => {
    // O dinheiro entrou (corrida com o cancelamento): some se não registrar,
    // e repassar seria pagar ao proprietário o que talvez precise voltar.
    const service = fakeSupabase({
      ...diario,
      contract_charges: { data: chargeRow({ canceled_at: '2026-10-05T00:00:00Z' }), error: null },
      charge_settlements: { data: null, error: null },
    })
    const { processarEventoDePagamento } = await carregar(service)
    expect(await processarEventoDePagamento(service.client, 't1', 'asaas', evento)).toBe('paga_apos_cancelamento')
    expect(escritas(service.calls, 'charge_settlements', 'insert')).toHaveLength(1)
    expect(service.calls.some((c) => c.table === 'owner_payouts')).toBe(false)
  })

  test('liquidação já registrada (CONFIRMED depois de RECEIVED): não repassa de novo', async () => {
    const service = fakeSupabase({
      ...diario,
      contract_charges: { data: chargeRow(), error: null },
      charge_settlements: { data: null, error: { code: '23505', message: 'dup' } },
    })
    const { processarEventoDePagamento } = await carregar(service)
    expect(await processarEventoDePagamento(service.client, 't1', 'asaas', evento)).toBe('liquidacao_ja_registrada')
    expect(service.calls.some((c) => c.table === 'owner_payouts')).toBe(false)
  })

  test('eco da nossa baixa manual (em dinheiro, já paga): nem tenta escrever', async () => {
    const service = fakeSupabase({ ...diario, contract_charges: { data: chargeRow({ charge_settlements: [liquidacao()] }), error: null } })
    const { processarEventoDePagamento } = await carregar(service)
    expect(await processarEventoDePagamento(service.client, 't1', 'asaas', { ...evento, emDinheiro: true })).toBe('eco_baixa_manual')
    expect(escritas(service.calls, 'charge_settlements', 'insert')).toHaveLength(0)
  })

  test('cancelado no provedor sem pagamento: cancela aqui, pelo tenant, sem autor humano', async () => {
    const service = fakeSupabase({ ...diario, contract_charges: { data: chargeRow(), error: null } })
    const { processarEventoDePagamento } = await carregar(service)
    expect(await processarEventoDePagamento(service.client, 't1', 'asaas', { ...evento, tipo: 'cancelado', bruto: 'PAYMENT_DELETED' })).toBe('cancelada')
    const upd = escritas(service.calls, 'contract_charges', 'update')[0]!.args[0] as Record<string, unknown>
    expect(upd).toMatchObject({ canceled_by: null, cancel_reason: 'Removida no painel do provedor' })
    expect(hadEq(service.calls, 'contract_charges', 'tenant_id')).toBe(true)
  })

  test('vencido e desconhecido: só o diário, a cobrança nem é lida', async () => {
    for (const tipo of ['vencido', 'outro'] as const) {
      const service = fakeSupabase(diario)
      const { processarEventoDePagamento } = await carregar(service)
      expect(await processarEventoDePagamento(service.client, 't1', 'asaas', { ...evento, tipo })).toBe('ignorado')
      expect(service.calls.some((c) => c.table === 'contract_charges')).toBe(false)
      vi.resetModules()
    }
  })
})
