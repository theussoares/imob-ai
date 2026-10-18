import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import type { ConversationState } from '~~/server/repositories/whatsapp.repository'
import type { MensagemRecebida } from '~~/server/services/whatsapp/provider'
import { fakeSupabase } from '../helpers/fake-supabase'

/**
 * A triagem roda a partir do webhook público e fala em nome da imobiliária.
 * As ameaças deste arquivo não são de tenant (a revisão confirmou o escopo),
 * e sim o robô falando quando não devia: por cima do corretor, para quem já é
 * cliente, ou duas vezes a mesma pergunta porque a Meta mandou duas mensagens
 * em paralelo.
 */

const enviarInterativo = vi.fn()
vi.mock('~~/server/services/whatsapp/cloud-api', () => ({ cloudApi: () => ({ enviarInterativo }) }))
vi.mock('~~/server/repositories/tenant.repository', () => ({
  getTenantById: async () => ({ id: 't1', name: 'Imobiliária X' }),
}))
vi.mock('~~/server/utils/lead-crm', () => ({ registrarEventos: vi.fn() }))
Object.assign(globalThis, { decifrar: (s: string) => s })

const { conduzirTriagem } = await import('~~/server/utils/whatsapp-triagem')

const conta = { tenantId: 't1', id: 'a1', phoneNumberId: 'p1', wabaId: 'w1', accessTokenEnc: 'tok', triagem: 'sempre' } as WhatsappAccountRecord

function estado(passo: ConversationState['triagem']['passo'] = null): ConversationState {
  return {
    id: 'c1',
    leadId: null,
    lastInboundAt: null,
    lastMessageAt: '2026-09-29T00:00:00Z',
    contactName: null,
    firstInboundAt: null,
    propertyId: null,
    triagem: { passo, tipo: passo === 'faixa' ? 'comprar' : null, faixa: null, tentativas: 0, em: new Date().toISOString() },
    firstResponseAt: null,
    unreadCount: 0,
    waId: '5511999990000',
    accountId: 'a1',
  }
}
const msg = { de: '5511999990000', texto: 'oi', respostaId: null, nomeDoPerfil: 'Ana' } as unknown as MensagemRecebida
const nova = { conversaNova: true, temImovel: false, leadId: null }

beforeEach(() => {
  enviarInterativo.mockReset()
  enviarInterativo.mockResolvedValue({ wamid: 'wamid.bot' })
})

describe('quando o robô começa', () => {
  test('conversa aberta pela imobiliária com modelo não é triada', async () => {
    // Lead do portal recebeu o modelo automático e respondeu "tenho interesse":
    // não tem entrada ao vivo nem resposta registrada, mas NÃO é conversa nova.
    const { client } = fakeSupabase({})
    await conduzirTriagem(client, conta, estado(), msg, { ...nova, conversaNova: false })
    expect(enviarInterativo).not.toHaveBeenCalled()
  })

  test('conversa nova começa, com a reserva do passo antes do envio', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_conversations: { data: [{ id: 'c1' }], error: null } })
    await conduzirTriagem(client, conta, estado(), msg, nova)
    expect(enviarInterativo).toHaveBeenCalledTimes(1)
    const reserva = calls.filter((c) => c.table === 'whatsapp_conversations')
    expect(reserva.some((c) => c.method === 'is' && c.args[0] === 'triagem_passo' && c.args[1] === null)).toBe(true)
    expect(reserva.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === 't1')).toBe(true)
  })
})

describe('corrida', () => {
  test('quem perde a reserva não manda nada', async () => {
    // "oi" e "vi o anúncio" em webhooks paralelos: o segundo acha o passo já
    // avançado (update sem linha) e fica quieto — uma saudação, não duas.
    const { client } = fakeSupabase({ whatsapp_conversations: { data: [], error: null } })
    await conduzirTriagem(client, conta, estado(), msg, nova)
    expect(enviarInterativo).not.toHaveBeenCalled()
  })

  test('envio que falha encerra a triagem em vez de esperar resposta que não virá', async () => {
    enviarInterativo.mockRejectedValue(new Error('token expirado'))
    const { client, calls } = fakeSupabase({ whatsapp_conversations: { data: [{ id: 'c1' }], error: null } })
    await conduzirTriagem(client, conta, estado(), msg, nova)
    const updates = calls.filter((c) => c.table === 'whatsapp_conversations' && c.method === 'update')
    expect((updates.at(-1)!.args[0] as { triagem_passo: string }).triagem_passo).toBe('interrompida')
  })
})

describe('pessoa entrou na conversa', () => {
  test('interromper vale também antes do primeiro passo', async () => {
    // O corretor responde enquanto o webhook da primeira mensagem ainda está
    // na roleta: o passo é null, e é ele que tem que virar 'interrompida' para
    // a reserva do webhook falhar.
    const { interromperTriagem } = await import('~~/server/repositories/whatsapp.repository')
    const { client, calls } = fakeSupabase({})
    await interromperTriagem(client, 't1', 'c1')
    const or = calls.find((c) => c.method === 'or')
    expect(String(or?.args[0])).toContain('triagem_passo.is.null')
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === 't1')).toBe(true)
  })
})
