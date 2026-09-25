import { describe, expect, test } from 'vitest'
import { canalDoTitular } from '~~/shared/utils/canal-titular'

/**
 * A política de privacidade sem canal não cumpre o art. 9º, IV da LGPD — e
 * era o que acontecia com toda imobiliária sem e-mail cadastrado.
 */
describe('canalDoTitular', () => {
  test('e-mail tem prioridade: deixa o pedido registrado por escrito', () => {
    expect(canalDoTitular({ email: 'contato@olmi.com.br', whatsapp: '5567999990000', phone: null })).toEqual({
      tipo: 'email',
      href: 'mailto:contato@olmi.com.br',
      rotulo: 'contato@olmi.com.br',
    })
  })

  test('sem e-mail, cai no WhatsApp (o caso da tatiane em 25/09)', () => {
    expect(canalDoTitular({ email: null, whatsapp: '5567999990000', phone: '5567999990000' })).toEqual({
      tipo: 'whatsapp',
      href: 'https://wa.me/5567999990000',
      rotulo: '+55 (67) 99999-0000',
    })
  })

  test('sem e-mail nem WhatsApp, cai no telefone', () => {
    expect(canalDoTitular({ email: '', whatsapp: null, phone: '556735211234' })).toEqual({
      tipo: 'telefone',
      href: 'tel:+556735211234',
      rotulo: '+55 (67) 3521-1234',
    })
  })

  test('telefone antigo sem DDI ainda vira canal', () => {
    expect(canalDoTitular({ email: null, whatsapp: null, phone: '(67) 3521-1234' })?.href).toBe('tel:+556735211234')
  })

  test('e-mail malformado não vira link quebrado', () => {
    expect(canalDoTitular({ email: 'contato', whatsapp: '5567999990000', phone: null })?.tipo).toBe('whatsapp')
  })

  test('sem nenhum contato válido, devolve null em vez de inventar', () => {
    expect(canalDoTitular({ email: null, whatsapp: '123', phone: null })).toBeNull()
  })
})
