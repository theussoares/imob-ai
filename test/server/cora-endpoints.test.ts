import { afterEach, describe, expect, test, vi } from 'vitest'
import { assertPaymentAccountInput } from '~~/server/utils/validate'
import { validarCertificado } from '~~/server/utils/certificado'
import { fakeSupabase } from '../helpers/fake-supabase'
import { CERT_A, KEY_A, KEY_B } from '../fixtures/certificados'

/**
 * Os dois endpoints que ligam a Cora ao dinheiro de uma imobiliária:
 *   - `PUT conta`: o par certificado + chave sai do navegador UMA vez; não pode
 *     ser gravado legível, nem voltar na resposta, nem ser aceito sem conferir;
 *   - o webhook: público e sem assinatura. O tenant sai da URL, o provedor da
 *     URL tem de ser o da conta, e nada do que vem nele é fato.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('~~/server/services/payments/cora')
  vi.doUnmock('~~/server/services/payments/cora-transporte')
})

const HOOK = '11111111-1111-4111-8111-111111111111'
const contaCora = {
  tenant_id: 'tenant-a',
  provider: 'cora',
  environment: 'sandbox',
  webhook_id: HOOK,
  webhook_secret_hash: null,
}

async function webhook(opts: { provider?: string; hookId?: string; conta?: unknown; headers?: Record<string, string>; consulta?: unknown }) {
  const processar = vi.fn(async () => 'liquidada')
  const consultar = vi.fn(async () => opts.consulta ?? { evento: null, situacao: { status: 'em_aberto' } })
  vi.stubGlobal('defineEventHandler', (h: unknown) => h)
  vi.stubGlobal('getRouterParam', (_e: unknown, n: string) => (n === 'provider' ? (opts.provider ?? 'cora') : (opts.hookId ?? HOOK)))
  vi.stubGlobal('getHeader', (_e: unknown, n: string) => opts.headers?.[n])
  vi.stubGlobal('readBody', async () => ({ tenant_id: 'tenant-b', forjado: true }))
  vi.stubGlobal('processarEventoDePagamento', processar)
  vi.stubGlobal('provedorDaConta', () => ({ consultar }))
  vi.stubGlobal('errMessage', (e: unknown) => String(e))
  const service = fakeSupabase({ tenant_payment_accounts: { data: 'conta' in opts ? opts.conta : contaCora, error: null } })
  vi.stubGlobal('serviceSupabase', () => service.client)
  const h = (await import('~~/server/api/webhooks/[provider]/[hookId].post')).default as unknown as (e: unknown) => Promise<unknown>
  return { run: () => h({}), processar, consultar }
}

const cabecalhos = { 'webhook-event-id': 'evt_1', 'webhook-event-type': 'invoice.paid', 'webhook-resource-id': 'inv_1' }
const pago = {
  evento: { eventId: 'consulta:inv_1:PAID', tipo: 'pago', bruto: 'invoice.paid', externalId: 'inv_1', valor: 10, data: '2026-10-05', metodo: 'pix', emDinheiro: false },
  situacao: { status: 'paga' },
}

describe('webhook da Cora', () => {
  test('o tenant é o da CONTA achada pela URL — nunca o do corpo', async () => {
    const m = await webhook({ headers: cabecalhos, consulta: pago })
    await expect(m.run()).resolves.toMatchObject({ success: true })
    expect(m.processar).toHaveBeenCalledWith(expect.anything(), 'tenant-a', 'cora', expect.objectContaining({ eventId: 'evt_1' }))
  })

  test('provedor da URL diferente do da conta: 404 (hook da Cora não responde em /asaas/)', async () => {
    const m = await webhook({ provider: 'asaas', headers: cabecalhos, consulta: pago })
    await expect(m.run()).rejects.toMatchObject({ statusCode: 404 })
    expect(m.processar).not.toHaveBeenCalled()
  })

  test('URL desconhecida, id malformado e provedor inexistente: 404', async () => {
    for (const o of [{ conta: null }, { hookId: 'não-é-uuid' }, { provider: 'banco-x' }]) {
      const m = await webhook({ headers: cabecalhos, ...o })
      await expect(m.run()).rejects.toMatchObject({ statusCode: 404 })
      expect(m.processar).not.toHaveBeenCalled()
      vi.resetModules()
    }
  })

  test('POST forjado sobre boleto em aberto: 200 "ignorado", nada liquidado', async () => {
    const m = await webhook({ headers: cabecalhos })
    await expect(m.run()).resolves.toEqual({ ok: true, resultado: 'ignorado' })
    expect(m.processar).not.toHaveBeenCalled()
  })

  test('cabeçalhos que não são de fatura: nem reconsulta', async () => {
    const m = await webhook({ headers: { 'webhook-event-id': 'e', 'webhook-event-type': 'transfer.completed', 'webhook-resource-id': 'tra_1' }, consulta: pago })
    await expect(m.run()).resolves.toMatchObject({ resultado: 'ignorado' })
    expect(m.consultar).not.toHaveBeenCalled()
  })

  test('Cora fora do ar na reconsulta: 500, para ela reenviar depois', async () => {
    const m = await webhook({ headers: cabecalhos })
    vi.stubGlobal('provedorDaConta', () => ({ consultar: async () => { throw new Error('timeout') } }))
    await expect(m.run()).rejects.toMatchObject({ statusCode: 500 })
  })
})

describe('PUT conta (Cora)', () => {
  async function conectar(over: Record<string, unknown> = {}, opts: { role?: string; verificar?: () => Promise<unknown> } = {}) {
    const cora = {
      verificarConta: vi.fn(opts.verificar ?? (async () => ({ nomeDaConta: null }))),
      registrarWebhook: vi.fn(async () => ({ externalId: 'ep_1,ep_2,ep_3' })),
    }
    vi.doMock('~~/server/services/payments/cora', () => ({ criarCora: vi.fn(() => cora) }))
    vi.doMock('~~/server/services/payments/cora-transporte', () => ({ criarTransporteCora: vi.fn(() => ({})) }))
    const cifrarCredenciaisCora = vi.fn(() => 'v1:cifrado')
    vi.stubGlobal('defineEventHandler', (h: unknown) => h)
    vi.stubGlobal('requireTenantMember', async () => ({
      tenant: { id: 'tenant-a', slug: 'olmi', email: 'c@olmi.com' },
      user: { id: 'u1' },
      membership: { role: opts.role ?? 'owner' },
    }))
    vi.stubGlobal('exigirCobranca', async () => {})
    vi.stubGlobal('readBody', async () => ({ provider: 'cora', environment: 'sandbox', clientId: 'int-abcdefgh', certificatePem: CERT_A, privateKeyPem: KEY_A, ...over }))
    vi.stubGlobal('assertPaymentAccountInput', assertPaymentAccountInput)
    vi.stubGlobal('validarCertificado', validarCertificado)
    vi.stubGlobal('cifrarCredenciaisCora', cifrarCredenciaisCora)
    vi.stubGlobal('getRequestURL', () => new URL('http://olmi.moradi.app/x'))
    vi.stubGlobal('provedorDaConta', () => ({ removerWebhook: async () => {} }))
    vi.stubGlobal('logWarn', () => {})
    vi.stubGlobal('errMessage', (e: unknown) => String(e))
    const service = fakeSupabase({
      tenant_payment_accounts: [
        { data: null, error: null },
        {
          data: { tenant_id: 'tenant-a', provider: 'cora', environment: 'sandbox', api_key_ciphertext: null, api_key_last4: null, account_name: null, webhook_id: 'w', webhook_secret_hash: null, external_webhook_id: 'ep_1', connected_at: '2026-10-06T00:00:00Z', client_id: 'int-abcdefgh', credentials_ciphertext: 'v1:cifrado', connection_status: 'conectada', credentials_updated_at: null, last_verified_at: null, certificate_expires_at: '2126-01-01T00:00:00Z' },
          error: null,
        },
      ],
    })
    vi.stubGlobal('serviceSupabase', () => service.client)
    const h = (await import('~~/server/api/admin/cobranca/conta.put')).default as unknown as (e: unknown) => Promise<{ conta: Record<string, unknown> }>
    return { run: () => h({}), cora, cifrarCredenciaisCora, service }
  }
  const upsert = (calls: ReturnType<typeof fakeSupabase>['calls']) =>
    calls.find((c) => c.table === 'tenant_payment_accounts' && c.method === 'upsert')?.args[0] as Record<string, unknown>

  test('grava o par CIFRADO, o client_id legível, a validade do certificado e a URL com provedor cora', async () => {
    const m = await conectar()
    const { conta } = await m.run()
    const u = upsert(m.service.calls)
    expect(u).toMatchObject({ provider: 'cora', client_id: 'int-abcdefgh', credentials_ciphertext: 'v1:cifrado', webhook_secret_hash: null, api_key_ciphertext: null })
    expect(u.certificate_expires_at).toEqual(expect.stringMatching(/^2\d{3}-/))
    expect(JSON.stringify(u)).not.toContain('BEGIN')
    expect(m.cora.registrarWebhook).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/olmi\.moradi\.app\/api\/webhooks\/cora\/[0-9a-f-]{36}$/), '', 'c@olmi.com')
    // Nada de segredo na resposta ao navegador.
    expect(JSON.stringify(conta)).not.toMatch(/BEGIN|v1:cifrado|int-abcdefgh/)
    expect(conta).toMatchObject({ provider: 'cora', clientIdLast4: 'efgh' })
  })

  test('só o dono conecta', async () => {
    const m = await conectar({}, { role: 'admin' })
    await expect(m.run()).rejects.toMatchObject({ statusCode: 403 })
    expect(m.service.calls).toHaveLength(0)
  })

  test('par que não casa: 422 antes de cifrar, de chamar a Cora ou de gravar', async () => {
    const m = await conectar({ privateKeyPem: KEY_B })
    await expect(m.run()).rejects.toMatchObject({ statusCode: 422 })
    expect(m.cifrarCredenciaisCora).not.toHaveBeenCalled()
    expect(m.cora.verificarConta).not.toHaveBeenCalled()
    expect(upsert(m.service.calls)).toBeUndefined()
  })

  test('a Cora recusa o certificado: 422 em português e nada gravado', async () => {
    const { ErroDoProvedor } = await import('~~/server/services/payments/provider')
    const m = await conectar({}, { verificar: async () => { throw new ErroDoProvedor('A Cora recusou o certificado.', true) } })
    await expect(m.run()).rejects.toMatchObject({ statusCode: 422, statusMessage: 'A Cora recusou o certificado.' })
    expect(upsert(m.service.calls)).toBeUndefined()
  })
})
