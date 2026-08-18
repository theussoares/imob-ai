import { describe, expect, test } from 'vitest'
import { isValidBrPhone, isValidWhatsapp, normalizeWhatsapp, onlyDigits } from '~~/shared/utils/phone'

/**
 * Telefone é o único dado que torna um lead útil: sem ele o contato chega e a
 * imobiliária não tem como retornar. É também o campo do formulário público
 * mais sujeito a lixo colado.
 */
describe('onlyDigits', () => {
  test('descarta máscara e espaços', () => {
    expect(onlyDigits('(67) 99217-1768')).toBe('67992171768')
    expect(onlyDigits(' 67 9 9217 1768 ')).toBe('67992171768')
  })

  test('tolera ausência de valor', () => {
    expect(onlyDigits(null)).toBe('')
    expect(onlyDigits(undefined)).toBe('')
  })
})

describe('isValidBrPhone', () => {
  test('aceita celular com DDD', () => {
    expect(isValidBrPhone('67992171768')).toBe(true)
  })

  test('aceita fixo com DDD', () => {
    expect(isValidBrPhone('6733214567')).toBe(true)
  })

  test('recusa número sem DDD', () => {
    expect(isValidBrPhone('992171768')).toBe(false)
  })

  test('recusa vazio e lixo', () => {
    expect(isValidBrPhone('')).toBe(false)
    expect(isValidBrPhone(null)).toBe(false)
    expect(isValidBrPhone('não tenho')).toBe(false)
  })
})

describe('normalizeWhatsapp', () => {
  test('põe o DDI 55 quando falta', () => {
    expect(normalizeWhatsapp('67992171768')).toBe('5567992171768')
  })

  test('não duplica o DDI quando já veio', () => {
    expect(normalizeWhatsapp('5567992171768')).toBe('5567992171768')
  })
})

describe('isValidWhatsapp', () => {
  // Contrato diferente do `isValidBrPhone`: aqui o DDI é obrigatório, porque o
  // valor alimenta link wa.me/tel: direto. Quem digita passa antes pelo
  // `normalizeWhatsapp` — validar sem normalizar é erro de quem chama.
  test('aceita número já com DDI', () => {
    expect(isValidWhatsapp('5567992171768')).toBe(true)
    expect(isValidWhatsapp('556733214567')).toBe(true)
  })

  test('recusa número sem DDI, mesmo sendo um celular válido', () => {
    expect(isValidWhatsapp('67992171768')).toBe(false)
  })

  test('recusa curto demais para virar link wa.me', () => {
    expect(isValidWhatsapp('5567')).toBe(false)
  })

  test('normalizar antes torna o número aceitável', () => {
    expect(isValidWhatsapp(normalizeWhatsapp('67992171768'))).toBe(true)
  })
})
