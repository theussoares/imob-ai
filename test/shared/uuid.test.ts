import { describe, expect, test } from 'vitest'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * A guarda que impede id malformado virar 500.
 *
 * Todo id de rota do sistema é `uuid` no banco. Sem esta checagem, o valor cru
 * chega em `.eq('id', ...)`, o Postgres devolve 22P02, o repositório dá
 * `throw error` e o handler responde erro de servidor — para o que é, no fundo,
 * um id que não existe. Nos endpoints do portal isso ainda distingue aquele id
 * dos outros para quem está sondando a URL.
 */

describe('ehUuid', () => {
  test('aceita o que o banco de fato guarda', () => {
    expect(ehUuid('0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6')).toBe(true)
    expect(ehUuid('0F5F4D2E-1C3A-4B5D-8E9F-A1B2C3D4E5F6')).toBe(true)
    expect(ehUuid('  0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6  ')).toBe(true)
  })

  test('recusa o que faria o Postgres devolver 22P02', () => {
    for (const ruim of [
      '',
      '   ',
      'abc',
      'nao-e-uuid',
      '../../etc/passwd',
      "1' or '1'='1",
      '0f5f4d2e-1c3a-4b5d-8e9f',
      '0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6-extra',
      'g0f5f4d2-1c3a-4b5d-8e9f-a1b2c3d4e5f6',
    ]) {
      expect(ehUuid(ruim), `aceitou ${JSON.stringify(ruim)}`).toBe(false)
    }
  })

  test('tolera ausência', () => {
    // O id da rota chega como `string | undefined`, e ausente é tão inválido
    // quanto malformado.
    expect(ehUuid(null)).toBe(false)
    expect(ehUuid(undefined)).toBe(false)
  })
})
