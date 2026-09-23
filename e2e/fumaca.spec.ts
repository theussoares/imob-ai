import { expect, test } from '@playwright/test'

/**
 * Não testa regra nenhuma — testa o harness.
 *
 * Existe porque as tarefas seguintes provisionam banco antes de abrir o
 * browser, e uma falha ali é indistinguível de "o Playwright não sobe o app".
 * Separar os dois custa dez linhas e economiza a primeira meia hora de
 * depuração no lugar errado.
 */
test('o app responde e a home da demo renderiza', async ({ page }) => {
  await page.goto('/?tenant=demo')
  await expect(page).toHaveTitle(/Aurora Imóveis/)
})
