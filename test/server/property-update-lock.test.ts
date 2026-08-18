import { describe, expect, test } from 'vitest'
import type { PropertyInput } from '~~/shared/models/property'
import { updateProperty } from '~~/server/repositories/property.repository'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'

const VERSAO_CARREGADA = '2026-08-18T02:06:01.484362+00:00'

function input(over: Partial<PropertyInput> = {}): PropertyInput {
  return {
    code: 'NC-0231',
    title: 'Casa no Centro',
    type: 'casa',
    purpose: 'venda',
    price: 350000,
    images: [{ url: 'https://exemplo/1.webp' }],
    ...over,
  } as PropertyInput
}

describe('updateProperty — conflito de edição simultânea', () => {
  test('recusa o salvamento quando o imóvel mudou desde que a tela carregou', async () => {
    const { client } = fakeSupabase({
      properties: [
        // Update com a condição de versão não pegou nenhuma linha.
        { data: [], error: null },
        // O imóvel existe — logo é conflito, não registro apagado.
        { data: { id: 'p1' }, error: null },
      ],
    })

    await expect(
      updateProperty(client, 't1', 'p1', input(), VERSAO_CARREGADA),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  test('não encosta nas fotos quando o salvamento é recusado', async () => {
    // Este é o dano concreto que a trava existe para impedir: `replaceImages`
    // apaga TODAS as imagens do imóvel antes de reinserir as do payload. Se ele
    // rodasse num salvamento recusado, as fotos que a outra pessoa acabou de
    // subir sumiriam — sem erro para ninguém.
    const { client, calls } = fakeSupabase({
      properties: [
        { data: [], error: null },
        { data: { id: 'p1' }, error: null },
      ],
    })

    await expect(
      updateProperty(client, 't1', 'p1', input(), VERSAO_CARREGADA),
    ).rejects.toThrow()

    expect(touched(calls, 'property_images')).toBe(false)
  })

  test('envia a versão carregada como condição do update', async () => {
    const { client, calls } = fakeSupabase({
      properties: [
        { data: [], error: null },
        { data: { id: 'p1' }, error: null },
      ],
    })

    await expect(
      updateProperty(client, 't1', 'p1', input(), VERSAO_CARREGADA),
    ).rejects.toThrow()

    expect(hadEq(calls, 'properties', 'updated_at')).toBe(true)
  })

  test('salva sem trava quando a versão não é informada (aba antiga em cache)', async () => {
    // Depois de um deploy, aba já aberta continua mandando o payload antigo, sem
    // a versão. Exigir o campo derrubaria quem está no meio de um cadastro — a
    // trava aperta sozinha conforme as abas recarregam.
    const { client, calls } = fakeSupabase({
      properties: [
        { data: [{ id: 'p1' }], error: null },
        { data: { id: 'p1', broker_id: null, property_images: [] }, error: null },
      ],
    })

    await updateProperty(client, 't1', 'p1', input())

    expect(hadEq(calls, 'properties', 'updated_at')).toBe(false)
    expect(touched(calls, 'property_images')).toBe(true)
  })
})
