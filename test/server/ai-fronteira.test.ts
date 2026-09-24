import { describe, expect, test } from 'vitest'
import { gerarTexto } from '~~/server/utils/ai'
import type { ClienteIA } from '~~/server/utils/ai'

function clienteQueResponde(texto: string, uso = { input_tokens: 500, output_tokens: 300 }) {
  const recebido: Record<string, unknown>[] = []
  const client: ClienteIA = {
    messages: {
      create: async (params) => {
        recebido.push(params as Record<string, unknown>)
        return { content: [{ type: 'text', text: texto }], usage: uso, model: 'claude-haiku-4-5' }
      },
    },
  }
  return { client, recebido }
}

function clienteQueFalha(erro: unknown): ClienteIA {
  return { messages: { create: async () => { throw erro } } }
}

describe('gerarTexto', () => {
  test('devolve o texto e a contagem de tokens', async () => {
    const { client } = clienteQueResponde('Casa ampla no Centro.')
    const r = await gerarTexto(client, { system: 'S', prompt: 'P' })
    expect(r.texto).toBe('Casa ampla no Centro.')
    expect(r.inputTokens).toBe(500)
    expect(r.outputTokens).toBe(300)
  })

  // Sem esses números a cota não tem o que contar, e a medição precisa existir
  // num lugar só — é a razão de esta fronteira existir em vez de o SDK entrar
  // direto no endpoint.
  test('manda a foto como bloco de imagem por URL quando ela existe', async () => {
    const { client, recebido } = clienteQueResponde('ok')
    await gerarTexto(client, { system: 'S', prompt: 'P', imagemUrl: 'https://x.supabase.co/a.webp' })
    const blocos = (recebido[0].messages as { content: { type: string }[] }[])[0].content
    expect(blocos[0]).toEqual({ type: 'image', source: { type: 'url', url: 'https://x.supabase.co/a.webp' } })
  })

  test('sem foto, manda só o texto', async () => {
    const { client, recebido } = clienteQueResponde('ok')
    await gerarTexto(client, { system: 'S', prompt: 'P' })
    const blocos = (recebido[0].messages as { content: { type: string }[] }[])[0].content
    expect(blocos.every((b) => b.type === 'text')).toBe(true)
  })

  // A mensagem do provedor nunca pode chegar ao painel: ela vaza nome de
  // modelo, limite de conta e às vezes o começo do prompt.
  test('erro de limite do provedor vira 429 com mensagem nossa', async () => {
    const erro = Object.assign(new Error('rate_limit_error: bucket exhausted'), { status: 429 })
    await expect(gerarTexto(clienteQueFalha(erro), { system: 'S', prompt: 'P' }))
      .rejects.toMatchObject({ statusCode: 429 })
    await expect(gerarTexto(clienteQueFalha(erro), { system: 'S', prompt: 'P' }))
      .rejects.not.toMatchObject({ statusMessage: expect.stringContaining('bucket') })
  })

  test('erro de autenticação vira 500 genérico', async () => {
    const erro = Object.assign(new Error('invalid x-api-key'), { status: 401 })
    await expect(gerarTexto(clienteQueFalha(erro), { system: 'S', prompt: 'P' }))
      .rejects.toMatchObject({ statusCode: 500 })
  })

  test('qualquer outro erro vira 502', async () => {
    await expect(gerarTexto(clienteQueFalha(new Error('socket hang up')), { system: 'S', prompt: 'P' }))
      .rejects.toMatchObject({ statusCode: 502 })
  })

  test('resposta sem bloco de texto vira 502 em vez de string vazia', async () => {
    const client: ClienteIA = {
      messages: { create: async () => ({ content: [], usage: { input_tokens: 1, output_tokens: 0 }, model: 'm' }) },
    }
    await expect(gerarTexto(client, { system: 'S', prompt: 'P' })).rejects.toMatchObject({ statusCode: 502 })
  })
})
