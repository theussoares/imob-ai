import { describe, expect, test } from 'vitest'
import { AI_TONES, AI_TONE_INSTRUCOES, AI_TONE_LABELS, tomValido } from '~~/shared/models/ai-tone'
import { COTA_MENSAL_DESCRICAO, COTA_MINUTO_DESCRICAO } from '~~/shared/models/ai-generation'

describe('tomValido', () => {
  test('aceita os três tons da lista', () => {
    for (const t of AI_TONES) expect(tomValido(t)).toBe(t)
  })

  // A constraint do banco pode ser burlada por escrita manual, e um tom
  // desconhecido não pode virar prompt vazio — o texto sairia sem instrução
  // nenhuma de estilo e ninguém entenderia por quê.
  test('cai em sobrio diante de qualquer coisa fora da lista', () => {
    for (const lixo of ['CALOROSO', 'caloroso ', '', null, undefined, 42, {}]) {
      expect(tomValido(lixo)).toBe('sobrio')
    }
  })

  test('todo tom tem rótulo e instrução de prompt', () => {
    for (const t of AI_TONES) {
      expect(AI_TONE_LABELS[t]).toBeTruthy()
      expect(AI_TONE_INSTRUCOES[t]).toBeTruthy()
    }
  })
})

describe('cotas de geração', () => {
  // Uma cota zerada ou negativa desligaria o recurso em silêncio para todo
  // mundo, e ninguém entenderia por quê — a linha de cota não brilha no painel
  // como "limite atingido". Por isso validamos que são sempre positivas aqui.
  test('cotas são números positivos', () => {
    expect(COTA_MENSAL_DESCRICAO).toBeGreaterThan(0)
    expect(COTA_MINUTO_DESCRICAO).toBeGreaterThan(0)
  })
})
