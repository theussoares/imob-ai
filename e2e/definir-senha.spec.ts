import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, tokensDeConvite, type Ambiente } from './support/tenant'

/**
 * A tela de primeiro acesso, exercitada uma vez — no fiador.
 *
 * Uma vez porque a tela é a mesma para os três papéis e repetir provaria o mesmo
 * três vezes. No fiador porque é o papel cujo cadastro nasce inteiro dentro do
 * teste.
 *
 * O que ela precisa dizer está no `c7225e8`: o título nomeia QUAL acesso está
 * sendo criado. Ela é gêmea de `/admin/definir-senha`, e um convite que caísse na
 * errada era indistinguível do certo — a pessoa preenchia a senha inteira antes
 * de descobrir.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  // Guarda: se `criarAmbiente()` lançar no `beforeAll`, o Playwright roda o
  // `afterAll` do mesmo jeito, e `amb` nunca foi atribuído. Sem o `if`, o
  // `TypeError` de `amb.slug` undefined entra no relatório como uma SEGUNDA
  // falha, na frente do erro de provisionamento — que é o real — escondendo-o.
  if (amb) await apagarAmbiente(amb.slug)
})

test('o fiador define a senha e entra', async ({ page }) => {
  const { accessToken, refreshToken } = await tokensDeConvite(amb.fiador.email)

  await page.goto(
    `/area-cliente/definir-senha?tenant=${amb.slug}#access_token=${accessToken}&refresh_token=${refreshToken}`,
  )

  // O título tem que dizer que é a Área do Cliente, não só "Definir sua senha".
  await expect(page.getByRole('heading', { name: /Área do Cliente/ })).toBeVisible()

  const novaSenha = `E2e!${Date.now()}`
  await page.locator('#senha').fill(novaSenha)
  await page.locator('#confirma').fill(novaSenha)
  await page.getByRole('button', { name: /Definir senha e entrar/ }).click()

  await expect(page.getByRole('heading', { name: 'Meus contratos' })).toBeVisible()
})

test('a credencial some da barra de endereço', async ({ page }) => {
  // Sem o `history.replaceState`, o token fica no histórico e em qualquer print
  // que a pessoa mandar pedindo ajuda.
  const { accessToken, refreshToken } = await tokensDeConvite(amb.proprietario.email)

  await page.goto(
    `/area-cliente/definir-senha?tenant=${amb.slug}#access_token=${accessToken}&refresh_token=${refreshToken}`,
  )
  await expect(page.locator('#senha')).toBeVisible()
  expect(page.url()).not.toContain('access_token')
})

test('sem token, a tela explica em vez de girar', async ({ page }) => {
  await page.goto(`/area-cliente/definir-senha?tenant=${amb.slug}`)
  await expect(page.getByText(/não é mais válido/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Ir para o login/ })).toBeVisible()
})
