import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Agent } from 'node:https'
import {
  criarTransporteCora,
  limparCacheDaCora,
  tamanhoDoCacheDaCora,
  uuidDeterministico,
  type Enviar,
  type RequisicaoCrua,
} from '~~/server/services/payments/cora-transporte'
import { ErroDoProvedor } from '~~/server/services/payments/provider'
import { CERT_A, CERT_B, KEY_A, KEY_B } from '../fixtures/certificados'

/**
 * O transporte da Cora move o dinheiro de cada imobiliária com o certificado
 * DELA. As ameaças:
 *   - a requisição de um tenant sair com o agente mTLS (ou o token) de outro;
 *   - credencial trocada e o agente/token velho continuar valendo;
 *   - token vencido com dez requisições em voo fazendo dez pedidos de token;
 *   - retry de emissão gerando outro boleto (Idempotency-Key aleatória).
 */

const credA = { clientId: 'int-cliente-a', certificatePem: CERT_A, privateKeyPem: KEY_A }
const credB = { clientId: 'int-cliente-b', certificatePem: CERT_B, privateKeyPem: KEY_B }

function res(status: number, json: unknown = {}) {
  return { status, texto: JSON.stringify(json) }
}

/** Registra com que agente e com que token cada requisição saiu. */
function servidor(tokenPorClient: (corpo: string) => string = (c) => `tok-${c}`) {
  const chamadas: { agente: Agent; req: RequisicaoCrua }[] = []
  const enviar: Enviar = async (agente, req) => {
    chamadas.push({ agente, req })
    if (req.url.endsWith('/token')) {
      const clientId = new URLSearchParams(req.corpo).get('client_id')!
      return res(200, { access_token: tokenPorClient(clientId), expires_in: 86_400, token_type: 'Bearer' })
    }
    return res(200, { ok: true })
  }
  return { enviar, chamadas }
}

afterEach(() => limparCacheDaCora())

describe('isolamento entre contas', () => {
  test('o agente mTLS e o token de A nunca saem numa requisição de B', async () => {
    const s = servidor()
    const a = criarTransporteCora({ tenantId: 'tenant-a', credenciais: credA, ambiente: 'sandbox', enviar: s.enviar })
    const b = criarTransporteCora({ tenantId: 'tenant-b', credenciais: credB, ambiente: 'sandbox', enviar: s.enviar })

    await a.chamar('GET', '/v2/invoices/inv_a')
    await b.chamar('GET', '/v2/invoices/inv_b')

    const daA = s.chamadas.filter((c) => c.req.url.includes('inv_a'))[0]!
    const daB = s.chamadas.filter((c) => c.req.url.includes('inv_b'))[0]!
    expect(daA.req.cabecalhos.Authorization).toBe('Bearer tok-int-cliente-a')
    expect(daB.req.cabecalhos.Authorization).toBe('Bearer tok-int-cliente-b')
    // Agentes distintos, cada um com o seu certificado.
    expect(daA.agente).not.toBe(daB.agente)
    expect((daA.agente as unknown as { options: { cert: string } }).options.cert).toBe(CERT_A)
    expect((daB.agente as unknown as { options: { cert: string } }).options.cert).toBe(CERT_B)
    // O pedido de token do tenant B também usou o agente de B.
    const tokenB = s.chamadas.find((c) => c.req.url.endsWith('/token') && c.req.corpo?.includes('int-cliente-b'))!
    expect(tokenB.agente).toBe(daB.agente)
  })

  test('credencial trocada: o agente antigo é fechado e o token velho não vale', async () => {
    const s = servidor()
    const antes = criarTransporteCora({ tenantId: 'tenant-a', credenciais: credA, ambiente: 'sandbox', enviar: s.enviar })
    await antes.chamar('GET', '/v2/invoices/inv_1')
    const agenteAntigo = s.chamadas[0]!.agente
    const destruir = vi.spyOn(agenteAntigo, 'destroy')

    const depois = criarTransporteCora({ tenantId: 'tenant-a', credenciais: credB, ambiente: 'sandbox', enviar: s.enviar })
    await depois.chamar('GET', '/v2/invoices/inv_2')

    expect(destruir).toHaveBeenCalled()
    expect(tamanhoDoCacheDaCora()).toBe(1)
    const ultima = s.chamadas.at(-1)!
    expect(ultima.req.cabecalhos.Authorization).toBe('Bearer tok-int-cliente-b')
    expect(ultima.agente).not.toBe(agenteAntigo)
  })

  test('o ambiente escolhe o host: sandbox nunca fala com produção', async () => {
    const s = servidor()
    await criarTransporteCora({ tenantId: 't', credenciais: credA, ambiente: 'sandbox', enviar: s.enviar }).chamar('GET', '/v2/invoices/x')
    expect(s.chamadas.every((c) => c.req.url.includes('.stage.cora.com.br'))).toBe(true)
  })
})

describe('token', () => {
  test('dez requisições simultâneas com token vencido fazem UM pedido de token', async () => {
    const s = servidor()
    const t = criarTransporteCora({ tenantId: 'tenant-a', credenciais: credA, ambiente: 'sandbox', enviar: s.enviar })
    await Promise.all(Array.from({ length: 10 }, (_, i) => t.chamar('GET', `/v2/invoices/inv_${i}`)))
    expect(s.chamadas.filter((c) => c.req.url.endsWith('/token'))).toHaveLength(1)
  })

  test('o token é reaproveitado, e renovado ANTES das 24h (margem de 5 min)', async () => {
    const s = servidor()
    let agora = 1_000_000
    const t = criarTransporteCora({ tenantId: 'tenant-a', credenciais: credA, ambiente: 'sandbox', enviar: s.enviar, agora: () => agora })
    await t.chamar('GET', '/v2/invoices/1')
    agora += 60 * 60_000
    await t.chamar('GET', '/v2/invoices/2')
    expect(s.chamadas.filter((c) => c.req.url.endsWith('/token'))).toHaveLength(1)
    agora += 23 * 60 * 60_000 // 24h01 desde o primeiro
    await t.chamar('GET', '/v2/invoices/3')
    expect(s.chamadas.filter((c) => c.req.url.endsWith('/token'))).toHaveLength(2)
  })

  test('401 numa chamada: descarta o token, pede outro e tenta UMA vez', async () => {
    let n = 0
    const chamadas: RequisicaoCrua[] = []
    const enviar: Enviar = async (_a, req) => {
      chamadas.push(req)
      if (req.url.endsWith('/token')) return res(200, { access_token: `t${++n}`, expires_in: 86_400 })
      return req.cabecalhos.Authorization === 'Bearer t1' ? res(401) : res(200, { ok: true })
    }
    const r = await criarTransporteCora({ tenantId: 'x', credenciais: credA, ambiente: 'sandbox', enviar }).chamar('GET', '/v2/invoices/1')
    expect(r.status).toBe(200)
    expect(chamadas.filter((c) => c.url.endsWith('/token'))).toHaveLength(2)
  })

  test('401 persistente vira credencial inválida (e não laço)', async () => {
    const enviar: Enviar = async (_a, req) => (req.url.endsWith('/token') ? res(200, { access_token: 't', expires_in: 86_400 }) : res(401))
    const t = criarTransporteCora({ tenantId: 'x', credenciais: credA, ambiente: 'sandbox', enviar })
    await expect(t.chamar('GET', '/v2/invoices/1')).rejects.toMatchObject({ credencialInvalida: true })
  })

  test('a Cora recusando o certificado no token: mensagem em português, credencial inválida', async () => {
    const enviar: Enviar = async () => res(401, { error: 'invalid_client' })
    const t = criarTransporteCora({ tenantId: 'x', credenciais: credA, ambiente: 'sandbox', enviar })
    await expect(t.token()).rejects.toBeInstanceOf(ErroDoProvedor)
    await expect(t.token()).rejects.toMatchObject({ credencialInvalida: true, message: expect.stringContaining('client_id') })
  })

  test('handshake TLS recusado vira credencial inválida, sem vazar o erro cru', async () => {
    const enviar: Enviar = async () => {
      throw Object.assign(new Error('alert certificate unknown'), { code: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA' })
    }
    const t = criarTransporteCora({ tenantId: 'x', credenciais: credA, ambiente: 'sandbox', enviar })
    await expect(t.token()).rejects.toMatchObject({ credencialInvalida: true, message: expect.stringContaining('certificado') })
  })
})

describe('Idempotency-Key determinística', () => {
  test('a mesma cobrança gera a mesma chave; outra, outra — e é um UUID', () => {
    const k = uuidDeterministico('charge:abc:v1')
    expect(k).toBe(uuidDeterministico('charge:abc:v1'))
    expect(k).not.toBe(uuidDeterministico('charge:abd:v1'))
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
