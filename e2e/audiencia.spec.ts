import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { DOCUMENTOS, ESPERADO } from './support/dados'
import { contarDocumentosPelaRLS, entrarNoPortal } from './support/portal'

/**
 * A regra de quem vê cada documento existe em DOIS lugares de propósito:
 * `canClientSeeDocument` em TypeScript e as policies da 0028 no banco. Os
 * comentários afirmam que as duas concordam; nada media isso até aqui.
 *
 * O modo de falha é silencioso e caro: as duas discordando para o lado
 * permissivo mostra ao inquilino quanto o proprietário recebe, ou o contrato de
 * administração — que traz a taxa, a conta bancária e o Pix pessoal dele.
 *
 * As asserções de tela abaixo medem a COMPOSIÇÃO: `requirePortalUser` monta o
 * client com o token do cliente (a RLS está no caminho), e dentro dele
 * `listDocumentsForClient` filtra de novo em TypeScript por `visibleDocumentsFor`
 * — as duas barreiras formam um E lógico sobre a mesma resposta, e um
 * `toHaveCount` no fim não distingue qual delas produziu o número. Derrubar só
 * a policy `portal_documents_read` não move nenhuma dessas asserções, porque o
 * filtro de TS cobre o buraco sozinho. `contarDocumentosPelaRLS` (ver
 * `support/portal.ts`) fecha essa lacuna: bate direto no PostgREST com o
 * mesmo token, sem passar pelo endpoint, e mede a policy isolada — é o
 * equivalente, para o banco, do que a policy do bucket já media sozinha (ela
 * não tem gêmea em TypeScript, e foi por isso que denunciou o bug da 0040).
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

  // A metade que mede a policy sozinha, não a composição — ver o comentário
  // no topo do arquivo. Se algum dia só a RLS afrouxar (ou só o TS divergir
  // dela), é este número que sai de `ESPERADO.inquilino` primeiro; hoje as
  // duas concordam, então bate igual.
  expect(await contarDocumentosPelaRLS(page, amb.tenantId, amb.contratoId)).toBe(ESPERADO.inquilino)
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

  // Ver o comentário no topo do arquivo: mede a policy isolada, não o
  // endpoint. Este é o papel em que a audiência inclui o documento mais
  // sensível (contrato de administração) — o caso em que discordar para o
  // lado permissivo dói mais.
  expect(await contarDocumentosPelaRLS(page, amb.tenantId, amb.contratoId)).toBe(ESPERADO.proprietario)
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

  // Ver o comentário no topo do arquivo: mede a policy isolada, não o
  // endpoint.
  expect(await contarDocumentosPelaRLS(page, amb.tenantId, amb.contratoId)).toBe(ESPERADO.fiador)
})
