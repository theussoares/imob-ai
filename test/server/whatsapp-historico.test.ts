import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { lotesDoWebhook } from '~~/server/services/whatsapp/cloud-api'
import { registrarContatos, registrarHistorico } from '~~/server/utils/whatsapp-historico'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import { ACEITE_DO_HISTORICO, PRAZO_DO_HISTORICO_MS, podePedirHistorico } from '~~/shared/models/whatsapp'
import { fakeSupabase, touched } from '../helpers/fake-supabase'
import { stripComments } from '../helpers/strip-comments'

/**
 * Histórico do Coexistence (0061) — o ponto mais sensível de LGPD do recurso.
 *
 * Ameaças: histórico entrar sem a imobiliária ter decidido (o webhook é
 * público); conversa pessoal de quem nunca foi cliente entrar no modo padrão;
 * seis meses de agenda virarem card no funil e aviso para o corretor; e o
 * aceite ficar sem registro do que foi aceito.
 */

const CONTA = (mode: WhatsappAccountRecord['historyMode']): WhatsappAccountRecord => ({
  id: 'a1', tenantId: 't1', phoneNumberId: '111', wabaId: '2', displayPhone: null, verifiedName: null,
  accessTokenEnc: 'x', ativo: true, coexistencia: true, connectedAt: new Date().toISOString(),
  historyMode: mode, historyStatus: mode ? 'solicitado' : null, historyRequestedAt: null,
})

const pedaco = (msgs = 1) => [{
  progresso: 40,
  recusado: false,
  conversas: [{ waId: '5567991234567', mensagens: Array.from({ length: msgs }, (_, i) => ({
    wamid: `h${i}`, doContato: i % 2 === 0, tipo: 'text', texto: 'oi', midia: null, quando: `2026-09-2${i}T12:00:00.000Z`,
  })) }],
}]

const ESTADO = { id: 'c1', lead_id: null, last_inbound_at: null, last_message_at: '2026-01-01T00:00:00+00:00', contact_name: null, first_response_at: null, unread_count: 0, wa_id: '5567991234567', account_id: 'a1' }

describe('sem pedido, nada entra', () => {
  test('histórico sem history_mode é descartado sem tocar em tabela', async () => {
    const { client, calls } = fakeSupabase({})
    await registrarHistorico(client, CONTA(null), pedaco())
    expect(calls).toEqual([])
  })

  test('a agenda também não', async () => {
    const { client, calls } = fakeSupabase({})
    await registrarContatos(client, CONTA(null), [{ waId: '5567991234567', nome: 'Ana' }])
    expect(calls).toEqual([])
  })
})

describe('modo padrão: só quem já é contato', () => {
  test('telefone que não é lead: nem a conversa é criada', async () => {
    const { client, calls } = fakeSupabase({ leads: { data: [], error: null } })
    await registrarHistorico(client, CONTA('so_leads'), pedaco())
    expect(touched(calls, 'whatsapp_conversations')).toBe(false)
    expect(touched(calls, 'whatsapp_messages')).toBe(false)
  })

  test('telefone que é lead: importa, marcado como histórico, sem não lida, sem lead novo', async () => {
    const { client, calls } = fakeSupabase({
      leads: { data: [{ id: 'l1' }], error: null },
      whatsapp_conversations: [{ data: [ESTADO], error: null }, { data: null, error: null }],
      whatsapp_messages: [{ data: { id: 'm0' }, error: null }, { data: { id: 'm1' }, error: null }],
      whatsapp_accounts: { data: null, error: null },
    })
    await registrarHistorico(client, CONTA('so_leads'), pedaco(2))
    const inserts = calls.filter((c) => c.table === 'whatsapp_messages' && c.method === 'insert').map((c) => c.args[0] as Record<string, unknown>)
    expect(inserts).toHaveLength(2)
    expect(inserts.every((i) => i.imported === true && i.tenant_id === 't1')).toBe(true)
    expect(inserts.map((i) => i.direction)).toEqual(['in', 'out'])
    expect(calls.some((c) => c.table === 'rpc:whatsapp_conversa_nao_lida')).toBe(false)
    expect(calls.some((c) => c.table === 'leads' && c.method === 'insert')).toBe(false)
    const patch = calls.find((c) => c.table === 'whatsapp_conversations' && c.method === 'update')!.args[0] as Record<string, unknown>
    expect(patch).toMatchObject({ lead_id: 'l1', last_message_at: '2026-09-21T12:00:00.000Z', last_inbound_at: '2026-09-20T12:00:00.000Z' })
    expect(patch).not.toHaveProperty('first_response_at')
    expect(patch).not.toHaveProperty('unread_count')
  })

  test('histórico mais velho que a conversa não recua a última mensagem', async () => {
    const { client, calls } = fakeSupabase({
      leads: { data: [{ id: 'l1' }], error: null },
      whatsapp_conversations: [{ data: [{ ...ESTADO, lead_id: 'l1', last_message_at: '2026-09-29T00:00:00+00:00', last_inbound_at: '2026-09-29T00:00:00+00:00' }], error: null }],
      whatsapp_messages: { data: { id: 'm0' }, error: null },
    })
    await registrarHistorico(client, CONTA('so_leads'), pedaco(1))
    expect(calls.some((c) => c.table === 'whatsapp_conversations' && c.method === 'update')).toBe(false)
  })
})

describe('datas e critério do histórico', () => {
  test('conversa criada pelo histórico fica com a data da ÚLTIMA MENSAGEM, não a da importação', async () => {
    const hoje = new Date().toISOString()
    const { client, calls } = fakeSupabase({
      leads: { data: [{ id: 'l1' }], error: null },
      whatsapp_conversations: [
        { data: [], error: null }, // procura: não existe
        { data: [{ ...ESTADO, last_message_at: hoje }], error: null }, // upsert: criada agora
        { data: null, error: null }, // update
      ],
      whatsapp_messages: { data: { id: 'm0' }, error: null },
    })
    await registrarHistorico(client, CONTA('tudo'), pedaco(1))
    const patch = calls.find((c) => c.table === 'whatsapp_conversations' && c.method === 'update')!.args[0] as Record<string, unknown>
    expect(patch.last_message_at).toBe('2026-09-20T12:00:00.000Z')
  })

  test('"só contatos" conta só lead que existia antes da conexão', async () => {
    const { client, calls } = fakeSupabase({ leads: { data: [], error: null } })
    const conta = CONTA('so_leads')
    await registrarHistorico(client, conta, pedaco())
    const lt = calls.find((c) => c.table === 'leads' && c.method === 'lt')
    expect(lt?.args).toEqual(['created_at', conta.connectedAt])
  })
})

describe('agenda', () => {
  test('só dá nome a conversa que já existe; contato sem conversa não vira linha', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_conversations: [{ data: [], error: null }] })
    await registrarContatos(client, CONTA('tudo'), [{ waId: '5567991234567', nome: 'Ana' }])
    expect(calls.some((c) => c.method === 'insert' || c.method === 'upsert' || c.method === 'update')).toBe(false)
  })
})

describe('webhook do histórico', () => {
  const base = (field: string, value: object) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field, value: { metadata: { phone_number_id: '111' }, ...value } }] }],
  })

  test('direção pela thread: o que veio do contato é entrada', () => {
    const [l] = lotesDoWebhook(base('history', { history: [{ metadata: { progress: 100 }, threads: [{ id: '5567', messages: [
      { from: '5567', id: 'a', timestamp: '1', type: 'text', text: { body: 'Oi' } },
      { from: '5511999', id: 'b', timestamp: '2', type: 'text', text: { body: 'Olá!' } },
    ] }] }] }))
    expect(l!.historico![0]!.progresso).toBe(100)
    expect(l!.historico![0]!.conversas[0]!.mensagens.map((m) => m.doContato)).toEqual([true, false])
  })

  test('compartilhamento recusado no celular', () => {
    const [l] = lotesDoWebhook(base('history', { history: [{ errors: [{ code: 2593109 }] }] }))
    expect(l!.historico![0]!.recusado).toBe(true)
  })

  test('agenda: só contatos adicionados, com nome e telefone', () => {
    const [l] = lotesDoWebhook(base('smb_app_state_sync', { state_sync: [
      { type: 'contact', action: 'add', contact: { full_name: 'Ana Souza', phone_number: '+55 67 99123-4567' } },
      { type: 'contact', action: 'remove', contact: { full_name: 'Bia', phone_number: '5511' } },
      { type: 'contact', action: 'add', contact: { phone_number: '5511' } },
    ] }))
    expect(l!.contatos).toEqual([{ waId: '5567991234567', nome: 'Ana Souza' }])
  })
})

describe('pedido', () => {
  const agora = new Date('2026-09-29T12:00:00Z')
  const base = { coexistencia: true, connectedAt: new Date(agora.getTime() - 60_000).toISOString(), historyStatus: null }

  test('só Coexistence, só nas 24h, só uma vez (falha pode tentar de novo)', () => {
    expect(podePedirHistorico(base, agora)).toBe(true)
    expect(podePedirHistorico({ ...base, coexistencia: false }, agora)).toBe(false)
    expect(podePedirHistorico({ ...base, connectedAt: new Date(agora.getTime() - PRAZO_DO_HISTORICO_MS).toISOString() }, agora)).toBe(false)
    expect(podePedirHistorico({ ...base, historyStatus: 'solicitado' }, agora)).toBe(false)
    expect(podePedirHistorico({ ...base, historyStatus: 'falhou' }, agora)).toBe(true)
  })

  test('owner, aceite pelo texto exato, gravado ANTES de pedir à Meta', () => {
    const src = stripComments(readFileSync(join(process.cwd(), 'server/api/admin/whatsapp/history.post.ts'), 'utf8'))
    expect(src).toContain("membership.role !== 'owner'")
    expect(src).toContain('body?.aceite !== ACEITE_DO_HISTORICO')
    expect(src.indexOf('markHistoryRequested(')).toBeLessThan(src.indexOf("pedirSincronizacao(conexao, 'history')"))
    expect(ACEITE_DO_HISTORICO).toMatch(/controladora/)
  })

  test('o banco recusa modo sem aceite registrado', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0061_conversas_whatsapp_historico.sql'), 'utf8').replace(/--.*$/gm, '')
    expect(sql).toMatch(/check \(history_mode is null or \(history_consent_by is not null and history_consent_at is not null\)\)/)
  })
})
