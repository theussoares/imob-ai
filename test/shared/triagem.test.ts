import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  FAIXAS,
  dentroDoHorarioComercial,
  passoDaTriagem,
  resumoDaTriagem,
  type EstadoDaTriagem,
  type ResultadoDaTriagem,
} from '~~/shared/models/triagem'
import { lotesDoWebhook } from '~~/server/services/whatsapp/cloud-api'
import { conduzirTriagem } from '~~/server/utils/whatsapp-triagem'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import type { ConversationState } from '~~/server/repositories/whatsapp.repository'
import { fakeSupabase } from '../helpers/fake-supabase'
import { stripComments } from '../helpers/strip-comments'

/**
 * Triagem automática (0064). O que se trava: o fluxo chega ao fim com as três
 * respostas; desiste com educação de quem não quer botão; nunca começa onde
 * não deve (com imóvel, com humano, fora do modo); e sai da conversa quando
 * uma pessoa da equipe entra.
 */

const ctx = { nomeDaImobiliaria: 'OLMI', nome: 'Ana', dentroDoHorario: false }
const zero: EstadoDaTriagem = { passo: null, tipo: null, faixa: null, tentativas: 0 }
const avancar = (e: EstadoDaTriagem, respostaId: string | null, texto: string | null = null): ResultadoDaTriagem =>
  passoDaTriagem(e, { respostaId, texto }, ctx)

describe('o fluxo', () => {
  test('comprar → faixa → bairro → concluída, com as três respostas', () => {
    const r1 = avancar(zero, null, 'oi')
    expect(r1.enviar?.tipo).toBe('botoes')
    const r2 = avancar(r1.estado, 't_comprar')
    expect(r2.enviar).toMatchObject({ tipo: 'lista' })
    const r3 = avancar(r2.estado, 'fc_2')
    expect(r3.estado.passo).toBe('regiao')
    const r4 = avancar(r3.estado, null, 'Jardim das Paineiras')
    expect(r4.concluida).toEqual({ tipo: 'comprar', faixa: 'R$ 300 a 600 mil', regiao: 'Jardim das Paineiras' })
    expect(resumoDaTriagem(r4.concluida!)).toBe('Triagem pelo WhatsApp · quer comprar · R$ 300 a 600 mil · bairro: Jardim das Paineiras')
    expect(r4.enviar).toMatchObject({ tipo: 'texto' })
  })

  test('anunciar pergunta vender ou alugar, e não faixa de preço', () => {
    const r = avancar(avancar(avancar(zero, null).estado, 't_anunciar').estado, 'o_aluguel')
    expect(r.estado).toMatchObject({ passo: 'regiao', tipo: 'anunciar_aluguel' })
  })

  test('quem digita em vez de tocar no botão também passa', () => {
    const r = avancar(avancar(zero, null).estado, null, 'Quero alugar um apê')
    expect(r.estado.tipo).toBe('alugar')
  })

  test('fora do roteiro: repete uma vez; na segunda desiste e deixa para o corretor', () => {
    const p1 = avancar(zero, null).estado
    const r1 = avancar(p1, null, 'qual o horário de vocês?')
    expect(r1.estado).toMatchObject({ passo: 'tipo', tentativas: 1 })
    const r2 = avancar(r1.estado, null, 'e o endereço?')
    expect(r2.estado.passo).toBe('interrompida')
    expect(r2.enviar).toMatchObject({ tipo: 'texto' })
  })

  test('um parágrafo não é bairro', () => {
    const regiao: EstadoDaTriagem = { passo: 'regiao', tipo: 'comprar', faixa: null, tentativas: 0 }
    expect(avancar(regiao, null, 'x'.repeat(81)).concluida).toBeNull()
  })

  test('títulos dentro dos limites da Meta (botão 20, linha 24)', () => {
    const r = avancar(zero, null)
    if (r.enviar?.tipo === 'botoes') for (const b of r.enviar.botoes) expect(b.titulo.length).toBeLessThanOrEqual(20)
    for (const f of [...FAIXAS.comprar, ...FAIXAS.alugar]) expect(f.titulo.length).toBeLessThanOrEqual(24)
  })
})

describe('horário comercial (Brasília)', () => {
  test.each([
    ['2026-09-28T13:00:00Z', true], // seg 10h
    ['2026-09-28T23:00:00Z', false], // seg 20h
    ['2026-10-03T14:00:00Z', true], // sáb 11h
    ['2026-10-03T16:00:00Z', false], // sáb 13h
    ['2026-10-04T14:00:00Z', false], // dom
  ])('%s → %s', (iso, esperado) => expect(dentroDoHorarioComercial(new Date(iso))).toBe(esperado))
})

const CONTA = (triagem: WhatsappAccountRecord['triagem']): WhatsappAccountRecord => ({
  id: 'a1', tenantId: 't1', phoneNumberId: '111', wabaId: '2', displayPhone: null, verifiedName: null,
  accessTokenEnc: null, ativo: true, coexistencia: false, connectedAt: null, historyMode: null, historyStatus: null,
  historyRequestedAt: null, triagem,
})
const STATE: ConversationState = {
  id: 'c1', leadId: 'l1', lastInboundAt: null, lastMessageAt: '2026-09-29T00:00:00Z', contactName: null, firstInboundAt: null,
  propertyId: null, triagem: { passo: null, tipo: null, faixa: null, tentativas: 0, em: null }, firstResponseAt: null,
  unreadCount: 0, waId: '55', accountId: 'a1',
}
const MSG = { wamid: 'w', de: '55', nomeDoPerfil: 'Ana', tipo: 'text', texto: 'oi', midia: null, quando: '2026-09-29T00:00:00Z' }
const noite = new Date('2026-09-28T23:30:00Z')

describe('quando a triagem começa', () => {
  test('desligada: não toca em nada', async () => {
    const { client, calls } = fakeSupabase({})
    await conduzirTriagem(client, { ...CONTA('desligada'), accessTokenEnc: 'x' }, STATE, MSG, { primeiraEntrada: true, temImovel: false, leadId: 'l1' }, noite)
    expect(calls).toEqual([])
  })

  test.each([
    ['com imóvel (o corretor tem mais a dizer)', { primeiraEntrada: true, temImovel: true }, STATE],
    ['não é a primeira mensagem', { primeiraEntrada: false, temImovel: false }, STATE],
    ['alguém da equipe já respondeu', { primeiraEntrada: true, temImovel: false }, { ...STATE, firstResponseAt: '2026-09-28T00:00:00Z' }],
  ])('não começa %s', async (_, c, state) => {
    const { client, calls } = fakeSupabase({})
    await conduzirTriagem(client, { ...CONTA('sempre'), accessTokenEnc: 'x' }, state, MSG, { ...c, leadId: 'l1' }, noite)
    expect(calls).toEqual([])
  })

  test('"fora do horário" não começa em horário comercial', async () => {
    const { client, calls } = fakeSupabase({})
    await conduzirTriagem(client, { ...CONTA('fora_do_horario'), accessTokenEnc: 'x' }, STATE, MSG, { primeiraEntrada: true, temImovel: false, leadId: 'l1' }, new Date('2026-09-28T13:00:00Z'))
    expect(calls).toEqual([])
  })

  test('quem sumiu por mais de 2h: a triagem desiste sem mandar nada', async () => {
    const { client, calls } = fakeSupabase({ whatsapp_conversations: { data: null, error: null } })
    const parada = { ...STATE, triagem: { passo: 'faixa' as const, tipo: 'comprar' as const, faixa: null, tentativas: 0, em: '2026-09-28T20:00:00Z' } }
    await conduzirTriagem(client, { ...CONTA('sempre'), accessTokenEnc: 'x' }, parada, MSG, { primeiraEntrada: false, temImovel: false, leadId: 'l1' }, noite)
    const upd = calls.find((c) => c.table === 'whatsapp_conversations' && c.method === 'update')
    expect(upd?.args[0]).toMatchObject({ triagem_passo: 'interrompida' })
    expect(calls.some((c) => c.table === 'whatsapp_messages')).toBe(false)
  })
})

describe('o robô não se passa por gente', () => {
  const triagem = stripComments(readFileSync(join(process.cwd(), 'server/utils/whatsapp-triagem.ts'), 'utf8'))

  test("mensagem do robô é origin 'bot' e não mexe na conversa (continua 'sem resposta')", () => {
    expect(triagem).toContain("origin: 'bot'")
    expect(triagem).not.toContain('updateConversation(')
    expect(triagem).not.toContain('respostaPatch(')
  })

  test('resposta de pessoa, pelo painel ou pelo celular, tira o robô da conversa', () => {
    const envio = stripComments(readFileSync(join(process.cwd(), 'server/utils/whatsapp-envio.ts'), 'utf8'))
    const inbox = stripComments(readFileSync(join(process.cwd(), 'server/utils/whatsapp-inbox.ts'), 'utf8'))
    expect(envio).toContain('interromperTriagem(service, tenant.id, state.id)')
    expect(inbox.slice(inbox.indexOf('async function registrarEco'))).toContain('interromperTriagem(')
  })

  test('o botão tocado chega com o id', () => {
    const [l] = lotesDoWebhook({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '111' }, messages: [
        { from: '1', id: 'a', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 't_comprar', title: 'Comprar' } } },
        { from: '1', id: 'b', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'fc_2', title: 'R$ 300 a 600 mil' } } },
      ] } }] }],
    })
    expect(l!.recebidas.map((r) => [r.respostaId, r.texto])).toEqual([['t_comprar', 'Comprar'], ['fc_2', 'R$ 300 a 600 mil']])
  })
})
