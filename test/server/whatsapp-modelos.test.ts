import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { cloudApi, modeloDaMeta } from '~~/server/services/whatsapp/cloud-api'
import { assertWhatsappTemplateSend } from '~~/server/utils/validate'
import { MODELOS_SUGERIDOS, preencherModelo, problemaNoValor, variaveisDoModelo } from '~~/shared/models/whatsapp'
import { stripComments } from '../helpers/strip-comments'

/**
 * Modelos de mensagem (templates) — o único jeito de falar com o cliente
 * depois das 24h, e de começar a conversa com quem veio pelo formulário.
 *
 * Ameaças: o histórico registrar um texto diferente do que o cliente leu; o
 * painel mandar mensagem para um número que o membro digitou; o envio falhar
 * na Meta por formato de parâmetro (nomeado × posicional) sem a tela saber por
 * quê; e a paginação da Graph API levar o token para outro host.
 */

const CONEXAO = { phoneNumberId: '111', wabaId: '222', accessToken: 'TOKEN' }

function fetchFalso(respostas: unknown[]) {
  const chamadas: { url: string; init: RequestInit }[] = []
  const f = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init })
    const r = respostas.shift() ?? {}
    const erro = (r as { __status?: number }).__status
    return new Response(JSON.stringify(r), { status: erro ?? 200 })
  }) as unknown as typeof fetch
  return { f, chamadas }
}

describe('modelo da Meta', () => {
  const corpo = (text: string) => ({ type: 'BODY', text })

  test('aprovado, posicional, só corpo: suportado', () => {
    const m = modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'APPROVED', category: 'UTILITY', components: [corpo('Oi {{1}}, aqui é da {{2}}')] })
    expect(m).toMatchObject({ status: 'aprovado', category: 'UTILITY', variables: ['1', '2'], nomeado: false, suportado: true })
  })

  test('formato nomeado é lembrado — a Meta exige parameter_name nele', () => {
    const m = modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'APPROVED', category: 'MARKETING', parameter_format: 'NAMED', components: [corpo('Oi {{nome}}')] })
    expect(m).toMatchObject({ variables: ['nome'], nomeado: true })
  })

  test('cabeçalho de imagem ou link variável não é oferecido: a Meta recusaria sem os parâmetros', () => {
    expect(modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'HEADER', format: 'IMAGE' }, corpo('Oi')] })!.suportado).toBe(false)
    expect(
      modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'APPROVED', category: 'MARKETING', components: [corpo('Oi'), { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://x.com/{{1}}' }] }] })!.suportado,
    ).toBe(false)
    // Botão de resposta rápida e link fixo não pedem parâmetro.
    expect(
      modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'APPROVED', category: 'MARKETING', components: [corpo('Oi'), { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY' }, { type: 'URL', url: 'https://x.com' }] }] })!.suportado,
    ).toBe(true)
  })

  test('status da Meta traduzido; desconhecido não vira aprovado', () => {
    expect(modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'PENDING', components: [corpo('a')] })!.status).toBe('em_analise')
    expect(modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'REJECTED', components: [corpo('a')] })!.status).toBe('recusado')
    expect(modeloDaMeta({ name: 'x', language: 'pt_BR', status: 'NOVO_STATUS', components: [corpo('a')] })!.status).toBe('outro')
  })
})

describe('envio de modelo', () => {
  const base = { name: 'm', language: 'pt_BR', category: 'UTILITY' as const, status: 'aprovado' as const, body: '', suportado: true }

  test('posicional manda só o texto; nomeado manda parameter_name', async () => {
    const { f, chamadas } = fetchFalso([{ messages: [{ id: 'w1' }], contacts: [{ wa_id: '556791234567' }] }, { messages: [{ id: 'w2' }] }])
    const api = cloudApi(f)
    const r = await api.enviarModelo(CONEXAO, '5567991234567', { ...base, variables: ['1'], nomeado: false }, ['Ana'])
    await api.enviarModelo(CONEXAO, '5567991234567', { ...base, variables: ['nome'], nomeado: true }, ['Ana'])
    const corpo = (i: number) => JSON.parse(String(chamadas[i]!.init.body))
    expect(corpo(0).template.components[0].parameters).toEqual([{ type: 'text', text: 'Ana' }])
    expect(corpo(1).template.components[0].parameters).toEqual([{ type: 'text', parameter_name: 'nome', text: 'Ana' }])
    // O wa_id resolvido pela Meta volta — é por ele que a resposta chega.
    expect(r).toEqual({ wamid: 'w1', waId: '556791234567' })
  })

  test('modelo sem variáveis não manda components vazio', async () => {
    const { f, chamadas } = fetchFalso([{ messages: [{ id: 'w1' }] }])
    await cloudApi(f).enviarModelo(CONEXAO, '55', { ...base, variables: [], nomeado: false }, [])
    expect(JSON.parse(String(chamadas[0]!.init.body)).template.components).toBeUndefined()
  })

  test('a paginação nunca leva o token para outro host', async () => {
    const { f, chamadas } = fetchFalso([
      { data: [{ name: 'a', language: 'pt_BR', status: 'APPROVED', components: [{ type: 'BODY', text: 'a' }] }], paging: { next: 'https://evil.example/v24.0/222/message_templates?after=x' } },
    ])
    const lista = await cloudApi(f).listarModelos(CONEXAO)
    expect(lista).toHaveLength(1)
    expect(chamadas).toHaveLength(1)
    expect(chamadas.every((c) => c.url.startsWith('https://graph.facebook.com/'))).toBe(true)
  })

  test('criar modelo que já existe não é erro', async () => {
    const { f } = fetchFalso([{ __status: 400, error: { code: 100, error_subcode: 2388024, message: 'exists' } }])
    await expect(cloudApi(f).criarModelo(CONEXAO, { name: 'm', language: 'pt_BR', category: 'UTILITY', body: 'Oi {{1}}', exemplo: ['Ana'] })).resolves.toBe('ja_existe')
  })
})

describe('texto do modelo', () => {
  test('o histórico grava o texto que o cliente leu', () => {
    const body = 'Olá, {{1}}! Aqui é da {{2}}. {{1}}, tudo bem?'
    const vars = variaveisDoModelo(body)
    expect(vars).toEqual(['1', '2'])
    expect(preencherModelo(body, vars, ['Ana', 'OLMI'])).toBe('Olá, Ana! Aqui é da OLMI. Ana, tudo bem?')
  })

  test('valores que a Meta recusaria são barrados antes do envio', () => {
    expect(problemaNoValor('Ana')).toBeNull()
    expect(problemaNoValor('')).toBeTruthy()
    expect(problemaNoValor('linha\nquebrada')).toBeTruthy()
    expect(problemaNoValor('muito     espaço')).toBeTruthy()
  })

  test('os modelos sugeridos têm um exemplo por variável — sem isso a Meta não analisa', () => {
    for (const m of MODELOS_SUGERIDOS) expect(m.exemplo).toHaveLength(variaveisDoModelo(m.body).length)
  })

  test('o envio aceita nome, idioma e valores — e nenhum texto de corpo', () => {
    expect(() => assertWhatsappTemplateSend({ name: 'moradi_primeiro_contato', language: 'pt_BR', values: ['Ana'] })).not.toThrow()
    expect(() => assertWhatsappTemplateSend({ name: '../x', language: 'pt_BR', values: [] })).toThrow()
    expect(() => assertWhatsappTemplateSend({ name: 'm', language: 'pt_BR', values: [1] })).toThrow()
  })
})

describe('começar conversa com um contato', () => {
  const src = stripComments(readFileSync(join(process.cwd(), 'server/api/admin/whatsapp/lead/[id]/template.post.ts'), 'utf8'))

  test('o número sai do lead, nunca do body', () => {
    // Número do body = o painel mandando mensagem, em nome da imobiliária,
    // para quem o membro quisesse.
    expect(src).toContain('getLeadContact(client, tenant.id, leadId)')
    expect(src).not.toMatch(/body\.(phone|to|telefone|waId|numero)/)
  })

  test('o texto enviado é o que a Meta devolveu do modelo, não o do navegador', () => {
    const envio = stripComments(readFileSync(join(process.cwd(), 'server/utils/whatsapp-envio.ts'), 'utf8'))
    expect(envio).toContain('listarModelos(conexao)')
    expect(envio).toContain("modelo.status !== 'aprovado'")
    expect(src).not.toMatch(/body\.body|body\.text/)
  })
})
