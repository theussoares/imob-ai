import { expect, type Page } from '@playwright/test'
import type { Cliente } from './tenant'

/**
 * Entra no portal pela tela de verdade.
 *
 * Não injeta sessão no `localStorage` de propósito: a tela de login é onde
 * `portalAccessDenial` roda, e pular isso deixaria de fora a checagem que
 * distingue "não é cliente daqui" de "acesso desativado" — as duas frases que
 * existem justamente para a pessoa não ficar tentando a senha para sempre.
 *
 * O `?tenant=` é o atalho de dev e só funciona fora de produção
 * (`VERCEL_ENV !== 'production'`); é o que permite abrir o tenant descartável
 * sem cadastrar domínio.
 */
export async function entrarNoPortal(page: Page, slug: string, cliente: Cliente): Promise<void> {
  await page.goto(`/area-cliente/login?tenant=${slug}`)

  // Sem isto o clique corre na frente da hidratação: o HTML do SSR já mostra o
  // botão, o Playwright marca "actionable" e clica, mas o `@submit.prevent` do
  // Vue ainda não foi ligado — o navegador faz o GET nativo do form (sem
  // `name` nos campos, então sem querystring) de volta para a mesma rota, e o
  // `?tenant=` some junto. O sintoma foi um teste que fica preso na tela de
  // login sem NENHUM erro visível, porque não é login errado — é clique cedo
  // demais. `waitForSelector`/`toBeEnabled` não pegam isso: o botão já está
  // visível e habilitado antes da hidratação terminar.
  await page.waitForLoadState('networkidle')
  await page.locator('#email').fill(cliente.email)
  await page.locator('#senha').fill(cliente.senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Meus contratos' })).toBeVisible()
}
