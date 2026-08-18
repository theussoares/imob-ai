import { describe, expect, test } from 'vitest'
import { withDevTenantCookie } from '~~/server/utils/dev-tenant'

describe('withDevTenantCookie', () => {
  test('cria o cabeçalho quando não havia cookie nenhum', () => {
    expect(withDevTenantCookie(undefined, 'olmi')).toBe('dev_tenant=olmi')
    expect(withDevTenantCookie('', 'olmi')).toBe('dev_tenant=olmi')
  })

  test('preserva os outros cookies da requisição', () => {
    // A sessão do painel viaja aqui. Reescrever o cabeçalho inteiro deslogaria
    // a pessoa toda vez que ela trocasse de tenant.
    expect(withDevTenantCookie('sb-access=abc; outro=1', 'olmi')).toBe('sb-access=abc; outro=1; dev_tenant=olmi')
  })

  test('substitui o tenant anterior em vez de duplicar', () => {
    // Duplicata é pior que valor errado: qual das duas vale depende de quem lê.
    expect(withDevTenantCookie('dev_tenant=tatiane', 'olmi')).toBe('dev_tenant=olmi')
    expect(withDevTenantCookie('a=1; dev_tenant=tatiane; b=2', 'olmi')).toBe('a=1; b=2; dev_tenant=olmi')
  })

  test('não confunde cookie de nome parecido', () => {
    expect(withDevTenantCookie('meu_dev_tenant=x', 'olmi')).toBe('meu_dev_tenant=x; dev_tenant=olmi')
  })

  test('tolera espaçamento irregular', () => {
    expect(withDevTenantCookie('a=1;dev_tenant=velho;  b=2', 'novo')).toBe('a=1; b=2; dev_tenant=novo')
  })
})
