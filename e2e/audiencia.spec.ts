import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { DOCUMENTOS, ESPERADO } from './support/dados'
import { entrarNoPortal } from './support/portal'

/**
 * A regra de quem vê cada documento existe em DOIS lugares de propósito:
 * `canClientSeeDocument` em TypeScript e as policies da 0028 no banco. Os
 * comentários afirmam que as duas concordam; nada media isso até aqui.
 *
 * O modo de falha é silencioso e caro: as duas discordando para o lado
 * permissivo mostra ao inquilino quanto o proprietário recebe, ou o contrato de
 * administração — que traz a taxa, a conta bancária e o Pix pessoal dele.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('o inquilino vê exatamente os três documentos dele', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.inquilino)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()

  const itens = page.locator('ul.docs li')
  // Contagem EXATA, não `toContain`: o defeito que este teste existe para pegar
  // é um documento A MAIS, e `toContain` passaria feliz por ele.
  await expect(itens).toHaveCount(ESPERADO.inquilino)

  // Escopado em `ul.docs`, não em `page` inteira: a página também mostra o
  // título da SEÇÃO (`h3.grupo-tit`) com o rótulo da categoria, e para
  // "administração" esse rótulo é a mesma string do título do documento —
  // `getByText` sem escopo bateria nos dois e o teste travaria em "strict mode
  // violation" em vez de medir o que deveria.
  const docs = page.locator('ul.docs')
  await expect(docs.getByText(DOCUMENTOS.contrato.titulo)).toBeVisible()
  await expect(docs.getByText(DOCUMENTOS.vistoria.titulo)).toBeVisible()
  await expect(docs.getByText(DOCUMENTOS.boleto.titulo)).toBeVisible()

  // O que ele NÃO pode ver, nomeado um a um. Um `expect(count)` sozinho diria
  // que são três, não QUAIS três.
  await expect(docs.getByText(DOCUMENTOS.extrato.titulo)).toHaveCount(0)
  await expect(docs.getByText(DOCUMENTOS.administracao.titulo)).toHaveCount(0)
  await expect(docs.getByText(DOCUMENTOS.rascunho.titulo)).toHaveCount(0)
})

test('o proprietário vê os dele, incluindo o contrato de administração', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.proprietario)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()

  const docs = page.locator('ul.docs')
  await expect(page.locator('ul.docs li')).toHaveCount(ESPERADO.proprietario)
  await expect(docs.getByText(DOCUMENTOS.extrato.titulo)).toBeVisible()
  await expect(docs.getByText(DOCUMENTOS.administracao.titulo)).toBeVisible()
  await expect(docs.getByText(DOCUMENTOS.boleto.titulo)).toHaveCount(0)
  await expect(docs.getByText(DOCUMENTOS.rascunho.titulo)).toHaveCount(0)
})

test('o fiador vê só o que as duas pontas assinaram', async ({ page }) => {
  // O papel sem um único dado no banco antes desta suíte, e o de audiência mais
  // restrita: nada de boleto, extrato ou contrato de administração.
  await entrarNoPortal(page, amb.slug, amb.fiador)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()

  const docs = page.locator('ul.docs')
  await expect(page.locator('ul.docs li')).toHaveCount(ESPERADO.fiador)
  await expect(docs.getByText(DOCUMENTOS.contrato.titulo)).toBeVisible()
  await expect(docs.getByText(DOCUMENTOS.vistoria.titulo)).toBeVisible()
  await expect(docs.getByText(DOCUMENTOS.boleto.titulo)).toHaveCount(0)
  await expect(docs.getByText(DOCUMENTOS.extrato.titulo)).toHaveCount(0)
  await expect(docs.getByText(DOCUMENTOS.administracao.titulo)).toHaveCount(0)
})
