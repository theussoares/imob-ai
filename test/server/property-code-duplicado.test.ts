import { describe, expect, test } from 'vitest'
import type { PropertyInput } from '~~/shared/models/property'
import { createProperty, updateProperty } from '~~/server/repositories/property.repository'
import { fakeSupabase, touched } from '../helpers/fake-supabase'

/** O erro que o Postgres devolve quando o código já existe naquela imobiliária. */
const CODIGO_DUPLICADO = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "properties_tenant_id_code_key"',
  details: null,
  hint: null,
}

function input(over: Partial<PropertyInput> = {}): PropertyInput {
  return {
    code: 'VD-016',
    title: 'Barracão no Centro',
    type: 'barracao',
    purpose: 'venda',
    price: 350000,
    images: [{ url: 'https://exemplo/1.webp' }],
    ...over,
  } as PropertyInput
}

describe('código repetido não pode virar erro de servidor', () => {
  test('cadastrar com código já usado responde 409 dizendo qual é o código', async () => {
    const { client } = fakeSupabase({ properties: { data: null, error: CODIGO_DUPLICADO } })

    await expect(createProperty(client, 't1', input(), 'u1')).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: expect.stringContaining('VD-016'),
    })
  })

  test('editar um imóvel para um código já usado responde 409, não 500', async () => {
    const { client } = fakeSupabase({ properties: { data: null, error: CODIGO_DUPLICADO } })

    await expect(updateProperty(client, 't1', 'p1', input(), null, 'u1')).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: expect.stringContaining('VD-016'),
    })
  })

  test('o código vai na mensagem sem os espaços que a pessoa digitou', async () => {
    const { client } = fakeSupabase({ properties: { data: null, error: CODIGO_DUPLICADO } })

    await expect(createProperty(client, 't1', input({ code: '  VD-016  ' }), 'u1')).rejects.toMatchObject({
      statusMessage: expect.stringContaining('código VD-016'),
    })
  })

  test('cadastro recusado não encosta nas fotos', async () => {
    const { client, calls } = fakeSupabase({ properties: { data: null, error: CODIGO_DUPLICADO } })

    await expect(createProperty(client, 't1', input(), 'u1')).rejects.toThrow()

    expect(touched(calls, 'property_images')).toBe(false)
  })

  test('outro erro do banco continua subindo como está — só o 23505 é traduzido', async () => {
    // Traduzir qualquer falha do insert como "código repetido" mandaria a
    // pessoa mexer no campo certo por engano, e esconderia o erro de verdade.
    const outro = { code: '22P02', message: 'invalid input value for enum property_type: "galpao"' }
    const { client } = fakeSupabase({ properties: { data: null, error: outro } })

    await expect(createProperty(client, 't1', input(), 'u1')).rejects.toMatchObject({ code: '22P02' })
  })
})
