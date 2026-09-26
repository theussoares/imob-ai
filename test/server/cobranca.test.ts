import { afterEach, describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { criarAsaas, eventoDoAsaas, telefoneParaAsaas } from '~~/server/services/payments/asaas'
import { ErroDoProvedor } from '~~/server/services/payments/provider'
import { mesmoSegredo } from '~~/server/utils/segredo'
import { fakeSupabase, hadEq } from '../helpers/fake-supabase'

/**
 * Cobrança por provedor (0051). As ameaças, em ordem de custo:
 *   - webhook forjado baixando boleto que ninguém pagou;
 *   - webhook reenviado liquidando duas vezes (e gerando dois repasses);
 *   - dois cliques em "Emitir" gerando dois boletos para o mesmo mês;
 *   - boleto criado no provedor e esquecido aqui (pagável, nunca baixa);
 *   - chave do Asaas legível no banco;
 *   - nome de status do Asaas vazando para dentro do sistema.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('~~/server/services/payments/simulado')
})

function chargeRow(over: Record<string, unknown> = {}) {
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

describe('webhook do Asaas → evento normalizado', () => {
  test('boleto pago vira "pago" com o valor que ENTROU (com multa/juros)', () => {
    const e = eventoDoAsaas({
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1', value: 2455.2, originalValue: 2400, billingType: 'BOLETO', status: 'RECEIVED', clientPaymentDate: '2026-10-12', paymentDate: '2026-10-13' },
    })!
    expect(e).toMatchObject({ tipo: 'pago', valor: 2455.2, data: '2026-10-12', metodo: 'boleto', emDinheiro: false, externalId: 'pay_1' })
  })

  test('baixa em dinheiro no provedor é marcada (pode ser eco da nossa)', () => {
    const e = eventoDoAsaas({ id: 'evt_2', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 10, status: 'RECEIVED_IN_CASH' } })!
    expect(e.emDinheiro).toBe(true)
    expect(e.metodo).toBe('dinheiro')
  })

  test('nome do Asaas não sai do adaptador: evento desconhecido vira "outro"; lixo vira null', () => {
    expect(eventoDoAsaas({ id: 'e', event: 'PAYMENT_BANK_SLIP_VIEWED', payment: { id: 'p' } })!.tipo).toBe('outro')
    expect(eventoDoAsaas({ event: 'PAYMENT_RECEIVED' })).toBeNull()
    expect(eventoDoAsaas('x')).toBeNull()
  })

  test('telefone sai sem o 55, como o Asaas quer', () => {
    expect(telefoneParaAsaas('5567981112233')).toBe('67981112233')
    expect(telefoneParaAsaas(null)).toBeUndefined()
  })
})

describe('adaptador do Asaas (fetch falso)', () => {
  function fetchFalso(respostas: Record<string, { status?: number; body: unknown }>) {
    const chamadas: { url: string; init: RequestInit }[] = []
    const f = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init })
      const chave = Object.keys(respostas).find((k) => url.includes(k))
      const r = chave ? respostas[chave]! : { status: 404, body: {} }
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
    }) as unknown as typeof fetch
    return { f, chamadas }
  }

  test('sandbox no host de sandbox, com access_token e User-Agent (obrigatório desde 06/2024)', async () => {
    const { f, chamadas } = fetchFalso({ '/myAccount/commercialInfo': { body: { companyName: 'Imob Teste LTDA' } } })
    const r = await criarAsaas({ apiKey: '$aact_hmlg_x', ambiente: 'sandbox', fetch: f }).verificarConta()
    expect(r.nomeDaConta).toBe('Imob Teste LTDA')
    expect(chamadas[0]!.url.startsWith('https://api-sandbox.asaas.com/v3/')).toBe(true)
    const h = chamadas[0]!.init.headers as Record<string, string>
    expect(h.access_token).toBe('$aact_hmlg_x')
    expect(h['User-Agent']).toMatch(/Moradi/)
  })

  test('emissão leva multa e juros do contrato; linha e Pix que falham não desfazem o boleto', async () => {
    const { f, chamadas } = fetchFalso({
      '/identificationField': { body: { identificationField: '23793.38128 60000.000003 00000.000400 1 99990000240000' } },
      '/pixQrCode': { status: 400, body: { errors: [{ description: 'Sem chave Pix' }] } },
      '/payments': { body: { id: 'pay_9', invoiceUrl: 'https://sandbox.asaas.com/i/9' } },
    })
    const r = await criarAsaas({ apiKey: 'k'.repeat(30), ambiente: 'sandbox', fetch: f }).emitir({
      clienteExterno: 'cus_1',
      valor: 2400,
      vencimento: '2026-10-10',
      descricao: 'Aluguel 09/2026',
      referencia: 'ch1',
      multaPercent: 2,
      jurosMensalPercent: 1,
    })
    expect(r).toMatchObject({ externalId: 'pay_9', digitableLine: expect.stringContaining('23793'), pixCopyPaste: null })
    const corpo = JSON.parse(String(chamadas.find((c) => c.init.method === 'POST')!.init.body))
    expect(corpo).toMatchObject({ billingType: 'BOLETO', fine: { value: 2, type: 'PERCENTAGE' }, interest: { value: 1 }, externalReference: 'ch1' })
  })

  test('401 vira erro de credencial em português, e não 500', async () => {
    const { f } = fetchFalso({ '/myAccount': { status: 401, body: {} } })
    const p = criarAsaas({ apiKey: 'k'.repeat(30), ambiente: 'producao', fetch: f }).verificarConta()
    await expect(p).rejects.toBeInstanceOf(ErroDoProvedor)
    await expect(p).rejects.toMatchObject({ credencialInvalida: true })
  })

  test('simular pagamento é recusado fora do sandbox', async () => {
    const { f, chamadas } = fetchFalso({})
    await expect(criarAsaas({ apiKey: 'k'.repeat(30), ambiente: 'producao', fetch: f }).simularPagamento('pay_1', 10)).rejects.toThrow(/sandbox/)
    expect(chamadas).toHaveLength(0)
  })
})

describe('cofre da chave de API', () => {
  async function carregar(chave: string) {
    vi.stubGlobal('useRuntimeConfig', () => ({ paymentsEncryptionKey: chave }))
    return import('~~/server/utils/cofre')
  }

  test('a chave não fica legível no que vai para o banco, e volta intacta', async () => {
    const { cifrar, decifrar } = await carregar('m'.repeat(40))
    const guardado = cifrar('$aact_hmlg_SEGREDO')
    expect(guardado).not.toContain('SEGREDO')
    expect(guardado.startsWith('v1:')).toBe(true)
    expect(decifrar(guardado)).toBe('$aact_hmlg_SEGREDO')
    // IV novo a cada vez: a mesma chave não gera o mesmo texto (não dá para
    // descobrir que dois tenants usam a mesma chave comparando o banco).
    expect(cifrar('$aact_hmlg_SEGREDO')).not.toBe(guardado)
  })

  test('texto adulterado no banco FALHA, em vez de decifrar lixo (GCM autentica)', async () => {
    const { cifrar, decifrar } = await carregar('m'.repeat(40))
    const [v, iv, tag, dado] = cifrar('abc').split(':')
    const outro = Buffer.from(dado!, 'base64')
    outro[0] = outro[0]! ^ 1
    expect(() => decifrar([v, iv, tag, outro.toString('base64')].join(':'))).toThrow()
  })

  test('sem chave-mestra: 503 legível, nunca cifra com chave vazia', async () => {
    vi.stubGlobal('logError', () => {})
    const { cifrar } = await carregar('')
    expect(() => cifrar('x')).toThrow(expect.objectContaining({ statusCode: 503 }))
  })
})

describe('processarEventoDePagamento', () => {
  async function carregar() {
    vi.stubGlobal('decifrar', (s: string) => s)
    return import('~~/server/utils/cobranca')
  }
  const pago = { eventId: 'evt_1', tipo: 'pago' as const, bruto: 'PAYMENT_RECEIVED', externalId: 'pay_123', valor: 2400, data: '2026-10-09', metodo: 'boleto' as const, emDinheiro: false }

  test('evento repetido (reenvio do Asaas) não toca liquidação nenhuma', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client, calls } = fakeSupabase({ payment_webhook_events: { data: null, error: { code: '23505', message: 'dup' } } })
    expect(await processarEventoDePagamento(client, 't1', 'asaas', pago)).toBe('duplicado')
    expect(calls.some((c) => c.table === 'charge_settlements')).toBe(false)
  })

  test('pago: acha a cobrança PELO TENANT e liquida com chave por pagamento (não por evento)', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client, calls } = fakeSupabase({
      payment_webhook_events: { data: null, error: null },
      // 1ª leitura: pelo id externo; 2ª: releitura para o repasse (já paga).
      contract_charges: [
        { data: chargeRow(), error: null },
        { data: chargeRow({ charge_settlements: [{ id: 's1', amount: 2400, settled_on: '2026-10-09', method: 'boleto', created_by: null }] }), error: null },
      ],
      charge_settlements: { data: null, error: null },
      contracts: { data: null, error: null },
    })
    expect(await processarEventoDePagamento(client, 't1', 'asaas', pago)).toBe('liquidada')
    expect(hadEq(calls, 'contract_charges', 'tenant_id')).toBe(true)
    const ins = calls.find((c) => c.table === 'charge_settlements' && c.method === 'insert')!.args[0] as Record<string, unknown>
    // CONFIRMED e RECEIVED do mesmo pagamento colidem na mesma chave.
    expect(ins).toMatchObject({ tenant_id: 't1', idempotency_key: 'asaas:pago:pay_123', amount: 2400, created_by: null })
  })

  test('falha no meio: o evento sai do diário, para o reenvio tentar de novo', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client, calls } = fakeSupabase({
      payment_webhook_events: { data: null, error: null },
      contract_charges: { data: chargeRow(), error: null },
      charge_settlements: { data: null, error: { code: '57014', message: 'timeout' } },
    })
    await expect(processarEventoDePagamento(client, 't1', 'asaas', pago)).rejects.toBeTruthy()
    const del = calls.filter((c) => c.table === 'payment_webhook_events' && c.method === 'delete')
    expect(del).toHaveLength(1)
    expect(hadEq(calls, 'payment_webhook_events', 'tenant_id')).toBe(true)
  })

  test('boleto que o sistema não conhece não quebra o webhook (fica no diário)', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client } = fakeSupabase({ payment_webhook_events: { data: null, error: null }, contract_charges: { data: null, error: null } })
    expect(await processarEventoDePagamento(client, 't1', 'asaas', pago)).toBe('sem_cobranca')
  })

  test('cancelado no provedor com pagamento já registrado NÃO cancela aqui', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client, calls } = fakeSupabase({
      payment_webhook_events: { data: null, error: null },
      contract_charges: { data: chargeRow({ charge_settlements: [{ id: 's1', amount: 2400, settled_on: '2026-10-09', method: 'boleto', created_by: null }] }), error: null },
    })
    const r = await processarEventoDePagamento(client, 't1', 'asaas', { ...pago, eventId: 'evt_2', tipo: 'cancelado', bruto: 'PAYMENT_DELETED' })
    expect(r).toBe('ignorado_ja_paga')
    expect(calls.some((c) => c.table === 'contract_charges' && c.method === 'update')).toBe(false)
  })
})

describe('emitirCobranca', () => {
  const contrato = { id: 'c1', tenant_id: 't1', code: 'LOC-2026-001', property_id: null, address_label: 'Rua A', status: 'ativo', started_on: '2026-10-01', ends_on: null, rent_amount: 2400, due_day: 10, adjustment_index: null, term_months: null, guarantee_type: null, source: 'manual', created_at: '', updated_at: '' }
  const parte = { id: 'p1', role: 'inquilino', portal_user_id: 'pu1', portal_users: { name: 'Helena', email: null, active: true, doc: '52998224725', phone: null, user_id: null, tenant_id: 't1' } }
  const rascunho = chargeRow({ issued_amount: null, issued_at: null, provider: null, provider_environment: null, external_id: null })
  const conta = { tenant_id: 't1', provider: 'simulado', environment: 'sandbox', api_key_ciphertext: null, api_key_last4: null, account_name: null, webhook_id: 'w', webhook_secret_hash: null, external_webhook_id: null, connected_at: '' }
  const tenant = { id: 't1', slug: 'olmi' } as never

  function membro() {
    return fakeSupabase({
      contract_charges: { data: rascunho, error: null },
      contracts: { data: contrato, error: null },
      contract_internal: { data: null, error: null },
      contract_parties: { data: [parte], error: null },
    })
  }

  test('segundo clique (trava já tomada) não chega ao provedor', async () => {
    const emitir = vi.fn()
    vi.doMock('~~/server/services/payments/simulado', () => ({ criarSimulado: () => ({ nome: 'simulado', ambiente: 'sandbox', emitir, criarCliente: emitir, cancelar: emitir }) }))
    const service = fakeSupabase({
      tenant_payment_accounts: { data: conta, error: null },
      contract_charges: { data: [], error: null }, // update … is(issued_at, null) não pegou nada
    })
    vi.stubGlobal('serviceSupabase', () => service.client)
    const { emitirCobranca } = await import('~~/server/utils/cobranca')
    await expect(emitirCobranca(membro().client, tenant, 'ch1')).rejects.toMatchObject({ statusCode: 409 })
    expect(emitir).not.toHaveBeenCalled()
    const lock = service.calls.filter((c) => c.table === 'contract_charges' && c.method === 'is').map((c) => c.args[0])
    expect(lock).toContain('issued_at')
    expect(hadEq(service.calls, 'contract_charges', 'tenant_id')).toBe(true)
  })

  test('boleto criado lá e não gravado aqui é CANCELADO lá, e a trava desfeita', async () => {
    const cancelar = vi.fn(async () => {})
    vi.doMock('~~/server/services/payments/simulado', () => ({
      criarSimulado: () => ({
        nome: 'simulado',
        ambiente: 'sandbox',
        criarCliente: async () => ({ externalId: 'cus_1' }),
        emitir: async () => ({ externalId: 'pay_orfao', paymentUrl: null, bankSlipUrl: null, digitableLine: null, pixCopyPaste: null }),
        cancelar,
      }),
    }))
    const service = fakeSupabase({
      tenant_payment_accounts: { data: conta, error: null },
      payment_customers: { data: { external_id: 'cus_1' }, error: null },
      contract_charges: [
        { data: [{ id: 'ch1' }], error: null }, // trava
        { data: null, error: { message: 'queda de conexão' } }, // grava o emitido: falha
        { data: null, error: null }, // desfaz a trava
      ],
    })
    vi.stubGlobal('serviceSupabase', () => service.client)
    const { emitirCobranca } = await import('~~/server/utils/cobranca')
    await expect(emitirCobranca(membro().client, tenant, 'ch1')).rejects.toBeTruthy()
    expect(cancelar).toHaveBeenCalledWith('pay_orfao')
    const updates = service.calls.filter((c) => c.table === 'contract_charges' && c.method === 'update').map((c) => c.args[0])
    expect(updates.at(-1)).toEqual({ issued_at: null })
  })

  test('inquilino sem CPF/CNPJ: recusado ANTES da trava e da rede', async () => {
    const service = fakeSupabase({ tenant_payment_accounts: { data: conta, error: null } })
    vi.stubGlobal('serviceSupabase', () => service.client)
    const { emitirCobranca } = await import('~~/server/utils/cobranca')
    const m = fakeSupabase({
      contract_charges: { data: rascunho, error: null },
      contracts: { data: contrato, error: null },
      contract_parties: { data: [{ ...parte, portal_users: { ...parte.portal_users, doc: null } }], error: null },
    })
    await expect(emitirCobranca(m.client, tenant, 'ch1')).rejects.toMatchObject({ statusCode: 422, statusMessage: expect.stringMatching(/CPF/) })
    expect(service.calls.some((c) => c.table === 'contract_charges')).toBe(false)
  })
})

describe('webhook: autenticação', () => {
  const segredo = 'segredo-de-webhook-com-mais-de-32-caracteres!!'
  const conta = {
    tenant_id: 't1',
    provider: 'asaas',
    environment: 'sandbox',
    webhook_id: '11111111-1111-4111-8111-111111111111',
    webhook_secret_hash: createHash('sha256').update(segredo).digest('hex'),
  }

  async function handler(header: string | undefined, hookId = conta.webhook_id, contaAchada: unknown = conta) {
    const processar = vi.fn(async () => 'liquidada')
    vi.stubGlobal('defineEventHandler', (h: unknown) => h)
    vi.stubGlobal('getRouterParam', () => hookId)
    vi.stubGlobal('getHeader', (_e: unknown, n: string) => (n === 'asaas-access-token' ? header : undefined))
    vi.stubGlobal('readBody', async () => ({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 10, billingType: 'PIX' } }))
    vi.stubGlobal('mesmoSegredo', mesmoSegredo)
    vi.stubGlobal('hashDeSegredo', (s: string) => createHash('sha256').update(s).digest('hex'))
    vi.stubGlobal('processarEventoDePagamento', processar)
    const service = fakeSupabase({ tenant_payment_accounts: { data: contaAchada, error: null } })
    vi.stubGlobal('serviceSupabase', () => service.client)
    const h = (await import('~~/server/api/webhooks/asaas/[hookId].post')).default as unknown as (e: unknown) => Promise<unknown>
    return { run: () => h({}), processar, service }
  }

  test('segredo errado ou ausente: 401, e nada é processado', async () => {
    for (const header of [undefined, 'errado']) {
      const { run, processar } = await handler(header)
      await expect(run()).rejects.toMatchObject({ statusCode: 401 })
      expect(processar).not.toHaveBeenCalled()
      vi.resetModules()
    }
  })

  test('URL desconhecida: 404 (e não confirma que o id existe em outro formato)', async () => {
    const { run } = await handler(segredo, 'nao-e-uuid')
    await expect(run()).rejects.toMatchObject({ statusCode: 404 })
  })

  test('o tenant vem da conta achada pela URL, nunca do corpo', async () => {
    const { run, processar } = await handler(segredo)
    await run()
    expect(processar).toHaveBeenCalledWith(expect.anything(), 't1', 'asaas', expect.objectContaining({ externalId: 'pay_1' }))
  })
})

describe('estorno → repasse', () => {
  // A ameaça: o Asaas devolve o dinheiro ao inquilino e o repasse daquela
  // cobrança continua pendente — a imobiliária transfere ao proprietário um
  // valor que já não tem.
  async function carregar() {
    vi.stubGlobal('decifrar', (s: string) => s)
    return import('~~/server/utils/cobranca')
  }
  const estorno = { eventId: 'evt_r', tipo: 'estornado' as const, bruto: 'PAYMENT_REFUNDED', externalId: 'pay_123', valor: 2400, data: '2026-10-20', metodo: 'boleto' as const, emDinheiro: false }
  const pago = { id: 's1', amount: 2400, settled_on: '2026-10-09', method: 'boleto', created_by: null }
  const devolvido = { id: 's1r', amount: -2400, settled_on: '2026-10-20', method: 'boleto', created_by: null }

  function banco(over: Record<string, unknown> = {}) {
    return fakeSupabase({
      payment_webhook_events: { data: null, error: null },
      contract_charges: [
        { data: chargeRow({ charge_settlements: [pago] }), error: null }, // pelo id externo
        { data: chargeRow({ charge_settlements: [pago, devolvido] }), error: null }, // releitura depois do estorno
      ],
      charge_settlements: { data: null, error: null },
      owner_payouts: [
        { data: [{ id: 'po1', paid_at: null }], error: null }, // repasses de pé
        { data: [{ id: 'po1' }], error: null }, // o cancelamento pegou
      ],
      ...over,
    } as never)
  }
  const cancelamentos = (calls: ReturnType<typeof fakeSupabase>['calls']) =>
    calls.filter((c) => c.table === 'owner_payouts' && c.method === 'update').map((c) => c.args[0] as Record<string, unknown>)

  test('repasse pendente é cancelado, pelo tenant e só se ainda não saiu', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client, calls } = banco()
    expect(await processarEventoDePagamento(client, 't1', 'asaas', estorno)).toBe('estornada')
    expect(cancelamentos(calls)).toEqual([expect.objectContaining({ canceled_by: null, cancel_reason: 'Pagamento estornado no provedor' })])
    expect(hadEq(calls, 'owner_payouts', 'tenant_id')).toBe(true)
    // A busca é pelo item (a chave muda depois do estorno; a origem, não).
    expect(calls.some((c) => c.table === 'owner_payouts' && c.method === 'eq' && c.args[0] === 'payout_items.source_charge_id' && c.args[1] === 'ch1')).toBe(true)
    const travas = calls.filter((c) => c.table === 'owner_payouts' && c.method === 'is').map((c) => c.args[0])
    expect(travas).toEqual(expect.arrayContaining(['paid_at', 'canceled_at']))
  })

  test('repasse JÁ PAGO: não é tocado, e o diário diz que falta ação humana', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client, calls } = banco({ owner_payouts: { data: [{ id: 'po1', paid_at: '2026-10-16T12:00:00Z' }], error: null } })
    expect(await processarEventoDePagamento(client, 't1', 'asaas', estorno)).toBe('estornada_repasse_ja_pago')
    expect(cancelamentos(calls)).toHaveLength(0)
    const outcome = calls.find((c) => c.table === 'payment_webhook_events' && c.method === 'update')!.args[0]
    expect(outcome).toEqual({ outcome: 'estornada_repasse_ja_pago' })
  })

  test('"Marcar como pago" entre a leitura e o cancelamento: conta como já pago', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client } = banco({ owner_payouts: [{ data: [{ id: 'po1', paid_at: null }], error: null }, { data: [], error: null }] })
    expect(await processarEventoDePagamento(client, 't1', 'asaas', estorno)).toBe('estornada_repasse_ja_pago')
  })

  test('reenvio depois de queda no meio: estorno já gravado, e o repasse AINDA é cancelado', async () => {
    const { processarEventoDePagamento } = await carregar()
    const { client, calls } = banco({ charge_settlements: { data: null, error: { code: '23505', message: 'dup' } } })
    expect(await processarEventoDePagamento(client, 't1', 'asaas', estorno)).toBe('estorno_ja_registrado')
    expect(cancelamentos(calls)).toHaveLength(1)
  })

  test('outro pagamento ainda quita a cobrança: o repasse fica', async () => {
    const { processarEventoDePagamento } = await carregar()
    const outro = { id: 's2', amount: 2400, settled_on: '2026-10-21', method: 'pix', created_by: 'u1' }
    const { client, calls } = banco({
      contract_charges: [
        { data: chargeRow({ charge_settlements: [pago, outro] }), error: null },
        { data: chargeRow({ charge_settlements: [pago, outro, devolvido] }), error: null },
      ],
    })
    await processarEventoDePagamento(client, 't1', 'asaas', estorno)
    expect(calls.some((c) => c.table === 'owner_payouts')).toBe(false)
  })

  test('paga de novo depois do estorno: o novo repasse tem chave própria (não colide com o cancelado)', async () => {
    const { gerarRepasseSeQuitada } = await carregar()
    const contrato = { id: 'c1', tenant_id: 't1', code: 'LOC-1', property_id: null, address_label: 'Rua A', status: 'ativo', started_on: '2026-01-01', ends_on: null, rent_amount: 2400, due_day: 10, adjustment_index: null, term_months: null, guarantee_type: null, source: 'manual', created_at: '', updated_at: '' }
    const dono = { id: 'p2', role: 'proprietario', portal_user_id: 'pu2', portal_users: { name: 'Jorge', email: null, active: true, doc: null, phone: null, user_id: null, tenant_id: 't1' } }
    const chave = async (settlements: unknown[]) => {
      const { client, calls } = fakeSupabase({
        contract_charges: { data: chargeRow({ charge_settlements: settlements }), error: null },
        contracts: { data: contrato, error: null },
        contract_parties: { data: [dono], error: null },
        owner_payouts: { data: { id: 'po2' }, error: null },
      })
      expect(await gerarRepasseSeQuitada(client, 't1', 'ch1')).toBe('criado')
      return (calls.find((c) => c.table === 'owner_payouts' && c.method === 'insert')!.args[0] as Record<string, unknown>).idempotency_key
    }
    // O caso comum não muda de chave: repasses já gravados seguem idempotentes.
    expect(await chave([pago])).toBe('cobranca:ch1')
    expect(await chave([pago, devolvido, { ...pago, id: 's3', settled_on: '2026-10-22' }])).toBe('cobranca:ch1:apos-estorno-1')
  })
})
