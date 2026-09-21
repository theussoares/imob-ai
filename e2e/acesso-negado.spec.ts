import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, tokensDeConvite, type Ambiente } from './support/tenant'
import { service } from './support/supabase'
import { entrarNoPortal } from './support/portal'

/**
 * As duas recusas que precisam dizer o que fazer, não o que falhou.
 *
 * "Erro ao autenticar" depois de uma senha CERTA é o que faz o inquilino ligar
 * para a imobiliária — e a imobiliária ligar para nós.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('acesso desativado manda falar com a imobiliária', async ({ page }) => {
  // `tenant_id` junto do `id` é redundante — `id` já é chave primária. Fica
  // de propósito: isto é `service()`, que ignora RLS, escrevendo em `active`
  // num banco que serve quatro imobiliárias reais, e o CLAUDE.md abre os
  // invariantes de segurança com "toda query é escopada por tenant, sem
  // exceção". Não "limpar" este filtro depois é a intenção.
  await service()
    .from('portal_users')
    .update({ active: false })
    .eq('id', amb.inquilino.portalUserId)
    .eq('tenant_id', amb.tenantId)

  try {
    await page.goto(`/area-cliente/login?tenant=${amb.slug}`)
    // Mesma corrida documentada em `entrarNoPortal`: sem esperar a hidratação, o
    // clique cai antes do `@submit.prevent` do Vue estar ligado, o form faz o
    // GET nativo e a tela volta limpa — sem NENHUM erro visível, porque não foi
    // login errado, foi clique cedo demais.
    await page.waitForLoadState('networkidle')
    await page.locator('#email').fill(amb.inquilino.email)
    await page.locator('#senha').fill(amb.inquilino.senha)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByRole('alert')).toContainText(/desativado/)
    await expect(page.getByRole('alert')).toContainText(/imobiliária/)
  } finally {
    // No `finally`, não depois da última asserção: se a asserção falhar — que
    // é justamente quando há regressão de verdade — a reversão tem que rodar
    // do mesmo jeito. Senão quem for depurar encontra um ambiente com o
    // acesso desativado por um teste que não terminou, mentindo sobre o que
    // estava sendo testado. É o mesmo tipo de interrupção que
    // `varrerAmbientesAntigos` já existe para cobrir.
    await service()
      .from('portal_users')
      .update({ active: true })
      .eq('id', amb.inquilino.portalUserId)
      .eq('tenant_id', amb.tenantId)
  }
})

test('recurso desligado explica sem falar de pagamento', async ({ page, request }) => {
  // A mensagem NÃO menciona pagamento por decisão registrada: expor a
  // inadimplência da imobiliária aos clientes DELA é dano à imagem de terceiro.
  // É fácil de regredir "melhorando" a mensagem, e é por isso que está aqui.
  await entrarNoPortal(page, amb.slug, amb.proprietario)

  await service()
    .from('tenant_features')
    .update({ enabled: false })
    .eq('tenant_id', amb.tenantId)
    .eq('feature', 'portal')

  try {
    await page.reload()

    // A tela nunca mostra o `statusMessage` cru: `classificarFalha` (ver
    // shared/utils/session-error.ts) achata todo 403 na mesma frase genérica de
    // permissão. Isto cobre uma regressão futura que passasse a exibir o erro
    // do servidor direto na tela — hoje não é o caso, então esta asserção sozinha
    // não provaria nada sobre a mensagem em si.
    const corpo = await page.locator('body').innerText()
    expect(corpo).not.toMatch(/pagamento|fatura|inadimpl|cobran/i)

    // A garantia de verdade: bater direto no endpoint e ler o `statusMessage`
    // cru — que É visível em qualquer devtools, ainda que a tela não o repita.
    //
    // Não usei `page.waitForResponse` + `page.reload()` para capturar a resposta
    // do fetch que a própria tela dispara: tentei, e o Playwright falhou de vez
    // em quando com "Response body is not available for a response that was
    // navigated away from" — uma corrida do CDP contra a troca de frame do
    // reload, não um bug do app. Um teste que serve para travar regressão não
    // pode passar "na maioria das vezes"; uma chamada HTTP própria, fora do
    // ciclo de navegação da página, não tem essa corrida e é o caminho mais
    // direto até a string que o comentário em `portal-auth.ts` protege.
    //
    // `?tenant=` explícito porque esta chamada não é uma navegação de página —
    // não carrega o cookie de dev-tenant que o `entrarNoPortal` gravou.
    const { accessToken } = await tokensDeConvite(amb.proprietario.email)
    const resposta = await request.get(`/api/portal/contratos?tenant=${amb.slug}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(resposta.status()).toBe(403)
    const corpoResposta = await resposta.text()
    expect(corpoResposta).not.toMatch(/pagamento|fatura|inadimpl|cobran/i)
  } finally {
    // No `finally`, pelo mesmo motivo do outro teste deste arquivo: se a
    // asserção falhar — que é justamente o caso de regressão de verdade — o
    // recurso não pode ficar desligado para quem for investigar. Sem isto,
    // um `Ctrl+C` no meio da depuração deixa o tenant descartável com o
    // portal fora do ar, mentindo sobre o que o teste estava verificando.
    await service()
      .from('tenant_features')
      .update({ enabled: true })
      .eq('tenant_id', amb.tenantId)
      .eq('feature', 'portal')
  }
})
