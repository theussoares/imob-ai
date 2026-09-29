import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { assinaturaValida, lotesDoWebhook } from '~~/server/services/whatsapp/cloud-api'
import {
  insertMessage,
  saveAccount,
  updateMessageStatus,
} from '~~/server/repositories/whatsapp.repository'
import { processarLoteWhatsapp, respostaPatch } from '~~/server/utils/whatsapp-inbox'
import { assertWhatsappAccountInput } from '~~/server/utils/validate'
import {
  codigoDoImovelNaMensagem,
  janelaAberta,
  telefonesDoWaId,
} from '~~/shared/models/whatsapp'
import { formatPropertyCode } from '~~/shared/utils/property-specs'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'
import { stripComments } from '../helpers/strip-comments'

/**
 * Conversas do WhatsApp (0059).
 *
 * O webhook é público e serve TODAS as imobiliárias por uma URL só. As
 * ameaças que este arquivo cobre: alguém forjar mensagem sem ser a Meta; a
 * mensagem de uma imobiliária cair no painel de outra; o reenvio da Meta
 * duplicar mensagem, lead e aviso; um status atrasado "desler" a mensagem; e
 * um membro colar o `phone_number_id` de outra imobiliária para sequestrar as
 * conversas dela.
 */

const SEGREDO = 'segredo-do-app'
const assinar = (corpo: string) => 'sha256=' + createHmac('sha256', SEGREDO).update(corpo, 'utf8').digest('hex')

describe('assinatura do webhook', () => {
  const corpo = JSON.stringify({ object: 'whatsapp_business_account', nome: 'João Ávila' })

  test('aceita o corpo assinado pela Meta', () => {
    expect(assinaturaValida(corpo, assinar(corpo), SEGREDO)).toBe(true)
  })

  test('recusa corpo alterado depois de assinado', () => {
    expect(assinaturaValida(corpo.replace('João', 'Joao'), assinar(corpo), SEGREDO)).toBe(false)
  })

  test('recusa tudo quando o App Secret não está configurado', () => {
    // Com o segredo vazio, um HMAC com chave vazia é calculável por qualquer um.
    const comChaveVazia = 'sha256=' + createHmac('sha256', '').update(corpo).digest('hex')
    expect(assinaturaValida(corpo, comChaveVazia, '')).toBe(false)
  })

  test('recusa cabeçalho ausente, malformado ou de tamanho errado', () => {
    expect(assinaturaValida(corpo, undefined, SEGREDO)).toBe(false)
    expect(assinaturaValida(corpo, 'md5=abc', SEGREDO)).toBe(false)
    expect(assinaturaValida(corpo, 'sha256=abcd', SEGREDO)).toBe(false)
  })

  test('o webhook confere a assinatura sobre o corpo CRU, antes de ler JSON', () => {
    const src = stripComments(readFileSync(join(process.cwd(), 'server/api/webhooks/whatsapp/index.post.ts'), 'utf8'))
    expect(src).toContain('readRawBody(')
    expect(src).not.toContain('readBody(')
    expect(src.indexOf('assinaturaValida(')).toBeLessThan(src.indexOf('JSON.parse('))
  })
})

describe('de quem é a mensagem', () => {
  test('o webhook nunca resolve o tenant pelo Host', () => {
    // O Host é o nosso domínio para TODO tenant: resolver por ele entregaria a
    // conversa de todas as imobiliárias ao tenant de fallback.
    const src = stripComments(readFileSync(join(process.cwd(), 'server/api/webhooks/whatsapp/index.post.ts'), 'utf8'))
    expect(src).not.toMatch(/useTenantContext|event\.context\.tenant/)
    expect(src).toContain('getAccountByPhoneNumberId(')
  })

  test('toda escrita do processamento leva o tenant da conta', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_conversations: [
        // procura pelas duas formas do número: já existia
        { data: [{ id: 'c1', lead_id: 'l1', last_inbound_at: null, first_response_at: null, unread_count: 0, wa_id: '5567991234567', account_id: 'a1' }], error: null },
        { data: null, error: null }, // update
      ],
      whatsapp_messages: { data: { id: 'm1' }, error: null },
    })
    await processarLoteWhatsapp(client, CONTA, lote([msg('wamid.1')]))
    for (const t of ['whatsapp_conversations', 'whatsapp_messages']) expect(hadEq(calls, t, 'tenant_id') || insertLevaTenant(calls, t)).toBe(true)
    const rpc = calls.find((c) => c.table === 'rpc:whatsapp_conversa_nao_lida')
    expect(rpc?.args[0]).toEqual({ p_tenant_id: 't1', p_conversation_id: 'c1' })
  })
})

const CONTA = { id: 'a1', tenantId: 't1', phoneNumberId: '111', wabaId: '222', displayPhone: null, verifiedName: null, accessTokenEnc: 'x', ativo: true }
const msg = (wamid: string) => ({ wamid, de: '5567991234567', nomeDoPerfil: 'Ana', tipo: 'text', texto: 'Oi', midia: null, quando: '2026-09-29T12:00:00.000Z' })
const lote = (recebidas: ReturnType<typeof msg>[]) => ({ phoneNumberId: '111', recebidas, ecos: [], status: [] })
const insertLevaTenant = (calls: { table: string; method: string; args: unknown[] }[], t: string) =>
  calls.some((c) => c.table === t && (c.method === 'insert' || c.method === 'upsert') && (c.args[0] as { tenant_id?: string })?.tenant_id === 't1')

describe('mesma pessoa, uma conversa', () => {
  test('a mensagem que chega sem o nono dígito procura também a forma com ele', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_conversations: [{ data: [{ id: 'c1', lead_id: 'l1', last_inbound_at: null, first_response_at: null, unread_count: 0, wa_id: '5567991234567', account_id: 'a1' }], error: null }],
      whatsapp_messages: { data: null, error: { code: '23505' } },
    })
    await processarLoteWhatsapp(client, CONTA, { ...lote([]), recebidas: [{ ...msg('w'), de: '556791234567' }] })
    const busca = calls.find((c) => c.table === 'whatsapp_conversations' && c.method === 'in')
    expect(busca?.args[0]).toBe('wa_id')
    expect(busca?.args[1]).toEqual(expect.arrayContaining(['556791234567', '5567991234567']))
    // Achou: não cria outra.
    expect(calls.some((c) => c.table === 'whatsapp_conversations' && c.method === 'upsert')).toBe(false)
  })
})

describe('reenvio da Meta', () => {
  test('mensagem repetida (mesmo wamid) não conta não lida, não mexe na conversa e não cria lead', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_conversations: [
        { data: [{ id: 'c1', lead_id: null, last_inbound_at: null, first_response_at: null, unread_count: 0, wa_id: '5567991234567', account_id: 'a1' }], error: null },
      ],
      whatsapp_messages: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })
    await processarLoteWhatsapp(client, CONTA, lote([msg('wamid.1')]))
    expect(calls.some((c) => c.table === 'rpc:whatsapp_conversa_nao_lida')).toBe(false)
    expect(calls.some((c) => c.table === 'whatsapp_conversations' && c.method === 'update')).toBe(false)
    expect(touched(calls, 'leads')).toBe(false)
  })

  test('insertMessage devolve null no unique e lança nos demais erros', async () => {
    const dup = fakeSupabase({ whatsapp_messages: { data: null, error: { code: '23505' } } })
    await expect(insertMessage(dup.client, 't1', ARGS_MSG)).resolves.toBeNull()
    const outro = fakeSupabase({ whatsapp_messages: { data: null, error: { code: '42501', message: 'rls' } } })
    await expect(insertMessage(outro.client, 't1', ARGS_MSG)).rejects.toBeTruthy()
  })
})

const ARGS_MSG = {
  conversationId: 'c1',
  wamid: 'wamid.1',
  direction: 'in' as const,
  origin: 'contato' as const,
  type: 'text',
  body: 'Oi',
  status: 'recebida' as const,
  sentBy: null,
  occurredAt: '2026-09-29T12:00:00.000Z',
}

describe('status de entrega', () => {
  test('"entregue" atrasado não desfaz "lida": só sobrescreve estados anteriores', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_messages: { data: null, error: null } })
    await updateMessageStatus(client, 't1', 'wamid.1', 'entregue', null)
    const filtro = calls.find((c) => c.table === 'whatsapp_messages' && c.method === 'in')
    expect(filtro?.args).toEqual(['status', ['recebida', 'enviada']])
    expect(hadEq(calls, 'whatsapp_messages', 'tenant_id')).toBe(true)
  })
})

describe('conectar número', () => {
  test('número que já é de outra imobiliária é recusado, sem update nem insert', async () => {
    const { client, calls } = fakeSupabase({
      whatsapp_accounts: { data: { id: 'a9', tenant_id: 'OUTRO', phone_number_id: '111', waba_id: '2', display_phone: null, verified_name: null, access_token_enc: 'x', status: 'ativo' }, error: null },
    })
    const r = await saveAccount(client, 't1', { phoneNumberId: '111', wabaId: '2', displayPhone: null, verifiedName: null, accessTokenEnc: 'c', userId: 'u1' })
    expect(r).toBe('de_outro_tenant')
    expect(calls.some((c) => c.method === 'update' || c.method === 'insert')).toBe(false)
  })

  test('ids da Meta são só dígitos — eles entram no caminho da URL com o token', () => {
    const ok = { phoneNumberId: '123456789', wabaId: '987654321', accessToken: 'E'.repeat(40) }
    expect(() => assertWhatsappAccountInput(ok)).not.toThrow()
    expect(() => assertWhatsappAccountInput({ ...ok, phoneNumberId: '../me' })).toThrow()
    expect(() => assertWhatsappAccountInput({ ...ok, wabaId: '123?fields=x' })).toThrow()
    expect(() => assertWhatsappAccountInput({ ...ok, accessToken: 'curto' })).toThrow()
  })
})

describe('payload da Meta', () => {
  const base = (field: string, value: object) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '111' }, ...value } }] }],
  })

  test('mensagem recebida com nome do perfil', () => {
    const [l] = lotesDoWebhook(
      base('messages', {
        contacts: [{ wa_id: '556791234567', profile: { name: 'Ana' } }],
        messages: [{ from: '556791234567', id: 'wamid.A', timestamp: '1790000000', type: 'text', text: { body: 'Oi' } }],
      }),
    )
    expect(l!.phoneNumberId).toBe('111')
    expect(l!.recebidas).toEqual([
      { wamid: 'wamid.A', de: '556791234567', nomeDoPerfil: 'Ana', tipo: 'text', texto: 'Oi', midia: null, quando: new Date(1790000000 * 1000).toISOString() },
    ])
  })

  test('foto sem legenda vira mensagem sem texto, com o tipo', () => {
    const [l] = lotesDoWebhook(base('messages', { messages: [{ from: '1', id: 'w', timestamp: '1', type: 'image', image: { id: 'm' } }] }))
    expect(l!.recebidas[0]).toMatchObject({ tipo: 'image', texto: null })
  })

  test('eco do Coexistence: mensagem que o corretor mandou pelo celular', () => {
    const [l] = lotesDoWebhook(
      base('smb_message_echoes', { message_echoes: [{ from: '5567000', to: '556791234567', id: 'wamid.E', timestamp: '1', type: 'text', text: { body: 'Bom dia!' } }] }),
    )
    expect(l!.ecos).toEqual([{ wamid: 'wamid.E', para: '556791234567', tipo: 'text', texto: 'Bom dia!', midia: null, quando: new Date(1000).toISOString() }])
  })

  test('status com erro', () => {
    const [l] = lotesDoWebhook(base('messages', { statuses: [{ id: 'wamid.S', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] }] }))
    expect(l!.status).toEqual([{ wamid: 'wamid.S', status: 'falhou', erro: '131047 — Re-engagement message' }])
  })

  test('nunca lança com lixo — um 500 aqui faria a Meta desligar o webhook de todos', () => {
    for (const lixo of [null, 1, 'x', {}, { object: 'page' }, { object: 'whatsapp_business_account', entry: [{ changes: [{ value: null }] }] }]) {
      expect(lotesDoWebhook(lixo)).toEqual([])
    }
  })
})

describe('telefone do contato', () => {
  test('wa_id sem o nono dígito casa com o lead do formulário gravado com ele', () => {
    expect(telefonesDoWaId('556791234567')).toEqual(['67991234567', '6791234567'])
  })
  test('wa_id com o nono dígito', () => {
    expect(telefonesDoWaId('5567991234567')).toEqual(['67991234567', '6791234567'])
  })
  test('fixo não ganha nove', () => {
    expect(telefonesDoWaId('556735211234')).toEqual(['6735211234'])
  })
})

describe('imóvel na primeira mensagem', () => {
  test('lê o código do texto que o site monta no wa.me', () => {
    // A mesma forma de `useContact().whatsappLink`.
    const msg = `Olá! Tenho interesse no imóvel ${formatPropertyCode('v.d- 0010')} — Casa no Centro (venda · R$ 500.000). Ainda está disponível?`
    expect(codigoDoImovelNaMensagem(msg)).toBe('VD-0010')
  })
  test('não inventa código em texto livre', () => {
    expect(codigoDoImovelNaMensagem('Meu CEP é 79000-000, apto 12-B')).toBeNull()
    expect(codigoDoImovelNaMensagem(null)).toBeNull()
  })
})

describe('janela de 24h e primeira resposta', () => {
  const agora = new Date('2026-09-29T12:00:00.000Z')
  test('aberta até 24h da última mensagem do contato', () => {
    expect(janelaAberta('2026-09-28T12:00:01.000Z', agora)).toBe(true)
    expect(janelaAberta('2026-09-28T12:00:00.000Z', agora)).toBe(false)
    expect(janelaAberta(null, agora)).toBe(false)
  })

  test('a primeira resposta conta pelo app também, mas só depois de uma entrada', () => {
    expect(respostaPatch({ firstResponseAt: null, lastInboundAt: '2026-09-29T11:00:00Z' }, 'T', 'p').first_response_at).toBe('T')
    expect(respostaPatch({ firstResponseAt: null, lastInboundAt: null }, 'T', 'p').first_response_at).toBeUndefined()
    expect(respostaPatch({ firstResponseAt: 'X', lastInboundAt: '2026-09-29T11:00:00Z' }, 'T', 'p').first_response_at).toBeUndefined()
  })
})

describe('endpoints do painel', () => {
  const DIR = join(process.cwd(), 'server/api/admin/whatsapp')
  const arquivos = (d: string): string[] =>
    readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? arquivos(join(d, n)) : [join(d, n)]))

  test.each(arquivos(DIR).map((f) => [f.replace(DIR, '')]))('%s exige membro e o recurso ligado', (rel) => {
    // Recurso no SERVIDOR, não só no menu: mandar mensagem gasta a conta da
    // Meta da imobiliária e fala com o cliente dela em nome dela.
    const src = stripComments(readFileSync(join(DIR, rel), 'utf8'))
    expect(src).toContain('requireTenantMember(event)')
    expect(src).toContain('exigirWhatsapp(tenant.id)')
  })
})

describe('0059: escrita só pelo servidor', () => {
  const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/0059_conversas_whatsapp.sql'), 'utf8').replace(/--.*$/gm, '')
  const COMANDOS = SQL.replace(/\$\$[\s\S]*?\$\$/g, '$$').split(';').map((c) => c.replace(/\s+/g, ' ').trim())

  test.each(['whatsapp_accounts', 'whatsapp_conversations', 'whatsapp_messages'])('%s: RLS ligada e anon fora', (t) => {
    expect(COMANDOS).toContain(`alter table public.${t} enable row level security`)
    expect(COMANDOS).toContain(`revoke all on public.${t} from anon`)
  })

  test('nenhuma policy além de leitura — e nenhuma na tabela do token', () => {
    const policies = COMANDOS.filter((c) => c.startsWith('create policy'))
    expect(policies).toHaveLength(2)
    for (const p of policies) {
      expect(p).toMatch(/ for select to authenticated using \(public\.is_tenant_member\(tenant_id\)\)$/)
      expect(p).not.toContain('whatsapp_accounts')
    }
    expect(COMANDOS).toContain('revoke all on public.whatsapp_accounts from authenticated')
  })

  test('a constraint de recursos mantém todos os que já existiam', () => {
    // Recriar sem um valor DESLIGA aquele recurso de quem paga (0045/0054/0055).
    const c = COMANDOS.find((x) => x.includes('add constraint tenant_features_feature_check'))!
    for (const f of ['portal', 'about', 'ai', 'crm', 'cobranca', 'whatsapp']) expect(c).toContain(`'${f}'`)
  })

  test('a função de não lida não fica executável pela API REST', () => {
    expect(COMANDOS).toContain('revoke execute on function public.whatsapp_conversa_nao_lida(uuid, uuid) from public, anon, authenticated')
  })
})
