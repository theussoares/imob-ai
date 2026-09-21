import { expect, type Page } from '@playwright/test'
import type { Conta } from './tenant'

/**
 * Entra no painel da imobiliária.
 *
 * Client Supabase diferente do portal, com `storageKey` próprio
 * (`imob-admin-auth` contra `imob-portal-auth`) — o que impede uma sessão
 * derrubar a outra no mesmo navegador. Aqui isso importa na prática: os testes
 * de publicação abrem as duas.
 */
export async function entrarNoPainel(page: Page, slug: string, membro: Conta): Promise<void> {
  await page.goto(`/admin/login?tenant=${slug}`)

  // Mesmo cuidado do login do portal (`portal.ts`): sem esperar a hidratação,
  // o clique corre na frente do `@submit.prevent` e o form faz um GET nativo,
  // perdendo o `?tenant=` em silêncio — o teste ficaria preso na tela de login
  // sem nenhum erro visível.
  await page.waitForLoadState('networkidle')
  await page.locator('#email').fill(membro.email)
  await page.locator('#pass').fill(membro.senha)
  await page.getByRole('button', { name: /Entrar/ }).click()
  await expect(page).toHaveURL(/\/admin(\?|$)/)
}
