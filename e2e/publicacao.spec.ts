import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { entrarNoPainel } from './support/painel'
import { entrarNoPortal } from './support/portal'

/**
 * O único upload que passa pela interface, e o de maior aposta.
 *
 * A imobiliária é quem CLASSIFICA o documento, e a classificação decide quem
 * enxerga. Por isso a consequência tem que estar visível no momento da escolha —
 * é a razão de `describeAudience` existir, e é o que este teste fixa.
 *
 * O contrato de administração é o caso em que errar a caixinha expõe a taxa de
 * administração, a conta bancária e o Pix pessoal do proprietário ao inquilino.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('a tela diz quem vai ver antes de publicar, e o portal obedece', async ({ page }) => {
  await entrarNoPainel(page, amb.slug, amb.membro)
  await page.goto(`/admin/contratos/${amb.contratoId}?tenant=${amb.slug}`)

  await page.locator('#arq').setInputFiles('e2e/fixtures/documento.pdf')
  await page.locator('#cat').selectOption('contrato_administracao')
  await page.locator('#tit').fill('Administração E2E')

  // A frase, ANTES de enviar. Um rótulo que descreve a regra antiga é pior que
  // rótulo nenhum, porque quem leu confiou.
  await expect(page.locator('p.regra b')).toHaveText('Só o proprietário vê.')

  await page.getByRole('button', { name: 'Enviar documento' }).click()
  await expect(page.getByText('Administração E2E')).toBeVisible()

  // Nasce rascunho: publicar é ato separado.
  const linha = page.locator('li', { hasText: 'Administração E2E' })
  await expect(linha).toContainText('rascunho')
  await linha.getByRole('button', { name: 'Publicar' }).click()
  await expect(linha).not.toContainText('rascunho')
})

test('publicado, o proprietário vê e o inquilino não', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.proprietario)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()
  await expect(page.getByText('Administração E2E')).toBeVisible()

  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())

  await entrarNoPortal(page, amb.slug, amb.inquilino)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()
  await expect(page.getByText('Administração E2E')).toHaveCount(0)
})
