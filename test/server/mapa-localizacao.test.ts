import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { assertTenantSettingsInput } from '~~/server/utils/validate'
import { dentroDoBrasil, googleMapsEmbedSrc } from '~~/shared/utils/address'

// Duas falhas que se esconderam uma atrás da outra, de 08/09 a 24/09:
//  1. a CSP não tinha frame-src, então o iframe do mapa era bloqueado em todo
//     site e também na pré-visualização do painel;
//  2. por isso ninguém viu que a Olmi tinha gravado 20.78, 51.68 — sem o sinal
//     de menos, o pino caía no Cazaquistão.

describe('coordenadas: o sinal de menos esquecido', () => {
  const OLMI = { lat: -20.78736, lng: -51.68893 }

  test('a coordenada da Olmi sem sinal é recusada, com mensagem que aponta o sinal', () => {
    expect(() => assertTenantSettingsInput({ latitude: -OLMI.lat, longitude: -OLMI.lng })).toThrow(/sinal de menos/)
  })

  test('só a longitude sem sinal também é recusada', () => {
    expect(() => assertTenantSettingsInput({ latitude: OLMI.lat, longitude: -OLMI.lng })).toThrow(/fora do Brasil/)
  })

  test('a coordenada correta passa', () => {
    expect(() => assertTenantSettingsInput({ latitude: OLMI.lat, longitude: OLMI.lng })).not.toThrow()
  })

  test('os extremos do território cabem na caixa', () => {
    expect(dentroDoBrasil(5.27, -60.21)).toBe(true) // Monte Caburaí (RR)
    expect(dentroDoBrasil(-33.75, -53.39)).toBe(true) // Chuí (RS)
    expect(dentroDoBrasil(-7.15, -34.79)).toBe(true) // Ponta do Seixas (PB)
    expect(dentroDoBrasil(-7.53, -73.99)).toBe(true) // nascente do Moa (AC)
    expect(dentroDoBrasil(-3.85, -32.42)).toBe(true) // Fernando de Noronha
  })

  test('limpar as duas continua permitido', () => {
    expect(() => assertTenantSettingsInput({ latitude: null, longitude: null })).not.toThrow()
  })
})

describe('CSP libera o host que o mapa realmente usa', () => {
  // Estático de propósito: importar nuxt.config.ts em Node exige o Nuxt. O que
  // se amarra aqui é o host gerado por googleMapsEmbedSrc à diretiva — trocar
  // um sem o outro volta a bloquear o mapa em silêncio.
  const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
  const frameSrc = config.match(/"frame-src ([^"]+)"/)?.[1] ?? ''

  test('existe frame-src (senão herda default-src self e bloqueia)', () => {
    expect(frameSrc).not.toBe('')
  })

  test('inclui o host do embed e o do redirecionamento 301', () => {
    const src = googleMapsEmbedSrc({ latitude: -20.78, longitude: -51.68 })!
    expect(frameSrc.split(' ')).toContain(new URL(src).origin)
    expect(frameSrc.split(' ')).toContain('https://www.google.com')
  })
})
