import { afterEach, describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { assertPaymentAccountInput } from '~~/server/utils/validate'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * Conectar a conta do Asaas (`PUT /api/admin/cobranca/conta`). É a rota que
 * decide PARA ONDE vai o dinheiro da imobiliária. As ameaças:
 *   - um `admin` (convidado para cuidar do site) apontando os boletos para
 *     outra conta;
 *   - o segredo do webhook gravado legível (quem lê o banco forja pagamento);
 *   - a chave inválida gravada, e o erro só aparecendo no primeiro boleto;
 *   - a URL do webhook em http (o Asaas não segue redirect num POST) ou com
 *     o host errado.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('~~/server/services/payments/asaas')
})

const CHAVE = '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmU2'
const SEGREDO = 'segredo-novo-do-webhook-com-mais-de-32-caracteres'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

async function montar(opts: { role?: string; body?: unknown; anterior?: unknown; asaas?: Record<string, unknown>; removerAnterior?: () => Promise<void> } = {}) {
  const asaas = {
    verificarConta: vi.fn(async () => ({ nomeDaConta: 'Imobiliária Olmi' })),
    registrarWebhook: vi.fn(async () => ({ externalId: 'wh_novo' })),
    ...opts.asaas,
  }
  const criarAsaas = vi.fn(() => asaas)
  vi.doMock('~~/server/services/payments/asaas', () => ({ criarAsaas }))
  const removerWebhook = vi.fn(opts.removerAnterior ?? (async () => {}))
  const cifrar = vi.fn((s: string) => `cifrado(${s})`)

  vi.stubGlobal('defineEventHandler', (h: unknown) => h)
  vi.stubGlobal('requireTenantMember', async () => ({
    tenant: { id: 't1', slug: 'olmi', email: 'contato@olmi.com.br' },
    user: { id: 'u1' },
    membership: { role: opts.role ?? 'owner' },
  }))
  vi.stubGlobal('readBody', async () => opts.body ?? { provider: 'asaas', environment: 'sandbox', apiKey: `  ${CHAVE}  ` })
  vi.stubGlobal('assertPaymentAccountInput', assertPaymentAccountInput)
  // Imobiliária COM o recurso de cobrança (0055); o caso sem ele é testado em
  // `cobranca-por-tenant.test.ts`.
  vi.stubGlobal('exigirCobranca', async () => {})
  vi.stubGlobal('cifrar', cifrar)
  vi.stubGlobal('novoSegredoDeWebhook', () => SEGREDO)
  vi.stubGlobal('hashDeSegredo', hash)
  vi.stubGlobal('getRequestURL', () => new URL('http://olmi.moradi.app/api/admin/cobranca/conta'))
  vi.stubGlobal('provedorDaConta', () => ({ removerWebhook }))
  vi.stubGlobal('errMessage', (e: unknown) => String(e))
  const service = fakeSupabase({
    tenant_payment_accounts: [
      { data: opts.anterior ?? null, error: null },
      {
        data: { tenant_id: 't1', provider: 'asaas', environment: 'sandbox', api_key_ciphertext: 'x', api_key_last4: 'OmU2', account_name: 'Imobiliária Olmi', webhook_id: 'w', webhook_secret_hash: 'h', external_webhook_id: 'wh_novo', connected_at: '2026-09-25T00:00:00Z' },
        error: null,
      },
    ],
  })
  vi.stubGlobal('serviceSupabase', () => service.client)
  const h = (await import('~~/server/api/admin/cobranca/conta.put')).default as unknown as (e: unknown) => Promise<{ conta: Record<string, unknown> }>
  return { run: () => h({}), asaas, criarAsaas, cifrar, removerWebhook, service }
}

const upsert = (calls: ReturnType<typeof fakeSupabase>['calls']) =>
  calls.find((c) => c.table === 'tenant_payment_accounts' && c.method === 'upsert')?.args[0] as Record<string, unknown> | undefined

describe('PUT /api/admin/cobranca/conta', () => {
  test('só o dono conecta: admin recebe 403 antes de qualquer rede ou escrita', async () => {
    const m = await montar({ role: 'admin' })
    await expect(m.run()).rejects.toMatchObject({ statusCode: 403 })
    expect(m.criarAsaas).not.toHaveBeenCalled()
    expect(m.service.calls).toHaveLength(0)
  })

  test('grava o HASH do segredo; o segredo em si só vai para o Asaas', async () => {
    const m = await montar()
    await m.run()
    const [, segredoEnviado] = m.asaas.registrarWebhook.mock.calls[0] as unknown as [string, string]
    expect(segredoEnviado).toBe(SEGREDO)
    const gravado = upsert(m.service.calls)!
    expect(gravado.webhook_secret_hash).toBe(hash(SEGREDO))
    expect(JSON.stringify(gravado)).not.toContain(SEGREDO)
  })

  test('a chave é gravada cifrada (sem os espaços colados), e só os 4 últimos em claro', async () => {
    const m = await montar()
    await m.run()
    expect(m.cifrar).toHaveBeenCalledWith(CHAVE)
    const gravado = upsert(m.service.calls)!
    expect(gravado).toMatchObject({ tenant_id: 't1', api_key_ciphertext: `cifrado(${CHAVE})`, api_key_last4: CHAVE.slice(-4), connected_by: 'u1' })
    expect(JSON.stringify(gravado).replace(`cifrado(${CHAVE})`, '')).not.toContain(CHAVE)
  })

  test('webhook em https no host do painel, com id NOVO que é o mesmo gravado', async () => {
    const m = await montar()
    await m.run()
    const [url] = m.asaas.registrarWebhook.mock.calls[0] as unknown as [string]
    const gravado = upsert(m.service.calls)!
    expect(url).toBe(`https://olmi.moradi.app/api/webhooks/asaas/${gravado.webhook_id}`)
    expect(gravado.webhook_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('chave recusada pelo Asaas: 422 com a mensagem dele, e nada gravado', async () => {
    const { ErroDoProvedor } = await import('~~/server/services/payments/provider')
    const m = await montar({ asaas: { verificarConta: vi.fn(async () => { throw new ErroDoProvedor('Chave de API inválida.', true) }) } })
    await expect(m.run()).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Chave de API inválida.' })
    expect(upsert(m.service.calls)).toBeUndefined()
  })

  test('sem chave-mestra, falha ANTES de criar webhook no Asaas', async () => {
    // Na ordem inversa, o Asaas ficaria com um webhook apontando para cá
    // cujo segredo ninguém guardou.
    const m = await montar()
    m.cifrar.mockImplementation(() => {
      throw Object.assign(new Error('sem chave-mestra'), { statusCode: 503 })
    })
    await expect(m.run()).rejects.toMatchObject({ statusCode: 503 })
    expect(m.asaas.registrarWebhook).not.toHaveBeenCalled()
  })

  test('troca de conta: tenta remover o webhook antigo, e a falha disso não impede a nova', async () => {
    const anterior = { tenant_id: 't1', provider: 'asaas', environment: 'sandbox', api_key_ciphertext: 'x', external_webhook_id: 'wh_velho' }
    const m = await montar({ anterior, removerAnterior: async () => { throw new Error('Asaas fora do ar') } })
    const r = await m.run()
    expect(m.removerWebhook).toHaveBeenCalledWith('wh_velho')
    expect(upsert(m.service.calls)).toBeDefined()
    expect(r.conta).not.toHaveProperty('api_key_ciphertext')
  })

  test('simulado: sem chave, sem segredo, sem chamar o Asaas', async () => {
    const m = await montar({ body: { provider: 'simulado', environment: 'sandbox' } })
    await m.run()
    expect(m.criarAsaas).not.toHaveBeenCalled()
    expect(upsert(m.service.calls)).toMatchObject({ provider: 'simulado', api_key_ciphertext: null, webhook_secret_hash: null })
  })
})
