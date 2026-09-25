import { describe, expect, test } from 'vitest'
import { temaCss } from '~~/shared/utils/brand-color'

/**
 * O `<style>` de tema é montado com texto do banco, e o membro grava `tenants`
 * direto pelo PostgREST, sem a validação da API. `temaCss` é a única barreira
 * entre esse texto e o CSS de todas as páginas do site.
 */
describe('temaCss', () => {
  test('cores válidas viram variáveis', () => {
    expect(temaCss({ brandPrimary: '#0f3d38', brandAccent: '#C2410C', whatsappButtonColor: null }))
      .toBe('--brand:#0f3d38;--accent:#C2410C;')
  })

  test('cor inválida some, em vez de chegar ao CSS', () => {
    // Valor que existia em produção (tenant `tatiane`).
    expect(temaCss({ brandPrimary: '#0f3d38', brandAccent: 'VD001', whatsappButtonColor: null }))
      .toBe('--brand:#0f3d38;')
  })

  test('texto que tenta sair da declaração não passa', () => {
    const css = temaCss({
      brandPrimary: 'red;}body{display:none',
      brandAccent: '#fff;background:url(https://x.test/?c=1)',
      whatsappButtonColor: '#25d366',
    })
    expect(css).toBe('--wa:#25d366;')
  })
})
