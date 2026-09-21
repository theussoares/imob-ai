import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { entrarNoPortal } from './support/portal'

/**
 * Esconder o documento da lista não basta: o id viaja na URL e quem trocou o id
 * na mão não passa pela tela.
 *
 * A asserção é **404, não 403**, e a diferença é o ponto. Um 403 confirmaria que
 * aquele documento existe — é a decisão registrada no comentário do
 * `download.post.ts`, e é exatamente o tipo de coisa que alguém "corrige" para
 * 403 por achar mais semântico.
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

test('o inquilino não baixa o extrato do proprietário nem sabendo o id', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.inquilino)

  // A chamada sai do contexto da página logada: leva o token do inquilino, que é
  // o cenário real. Um `request.post` fora do browser não levaria sessão nenhuma
  // e devolveria 401, provando outra coisa.
  const status = await page.evaluate(async (docId) => {
    const sb = JSON.parse(localStorage.getItem('imob-portal-auth') || '{}')
    const r = await fetch(`/api/portal/documentos/${docId}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sb.access_token}` },
    })
    return r.status
  }, amb.documentos.extrato)

  expect(status).toBe(404)
})

test('o rascunho não é baixável nem por quem é a audiência dele', async ({ page }) => {
  // O rascunho é endereçado ao inquilino, mas `published_at` é nulo. É o caso em
  // que a audiência bate e mesmo assim tem que recusar.
  await entrarNoPortal(page, amb.slug, amb.inquilino)

  const status = await page.evaluate(async (docId) => {
    const sb = JSON.parse(localStorage.getItem('imob-portal-auth') || '{}')
    const r = await fetch(`/api/portal/documentos/${docId}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sb.access_token}` },
    })
    return r.status
  }, amb.documentos.rascunho)

  expect(status).toBe(404)
})

test('o documento dele baixa', async ({ page }) => {
  // O contraponto: sem ele, os dois testes acima passariam com o endpoint
  // quebrado devolvendo 404 para tudo.
  await entrarNoPortal(page, amb.slug, amb.inquilino)

  const status = await page.evaluate(async (docId) => {
    const sb = JSON.parse(localStorage.getItem('imob-portal-auth') || '{}')
    const r = await fetch(`/api/portal/documentos/${docId}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sb.access_token}` },
    })
    return r.status
  }, amb.documentos.boleto)

  expect(status).toBe(200)
})
