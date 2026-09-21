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

/**
 * Conta os documentos que a policy `portal_documents_read` (migration 0028,
 * reescrita sem recursão na 20260912190434) deixa passar para ESTE cliente,
 * batendo direto no PostgREST com o token dele — sem passar pelo endpoint
 * `/api/portal/contratos/[id]/documentos`.
 *
 * Existe porque `listDocumentsForClient` filtra a MESMA regra duas vezes: a
 * RLS decide no banco, `visibleDocumentsFor` decide de novo em TypeScript, e
 * `toHaveCount` no fim do endpoint não distingue qual das duas produziu o
 * número. Derrubar a policy sozinha não move aquele `toHaveCount` nem um
 * pouco, porque o filtro de TS cobre o buraco — é a mesma lacuna que o
 * download já fechou para o bucket (a policy de storage não tem gêmea em TS),
 * e aqui não tinha sido fechada.
 *
 * Os filtros da query (`tenant_id`, `contract_id`, `published_at not null`)
 * são exatamente os que `listDocumentsForClient` aplica antes de chamar
 * `visibleDocumentsFor` — o que sobra depois deles é só o que a RLS decidiu
 * por audiência. Se um dia a policy e `defaultAudienceFor`/`canClientSeeDocument`
 * discordarem, é este número — não o do endpoint — que muda primeiro.
 */
export async function contarDocumentosPelaRLS(
  page: Page,
  tenantId: string,
  contratoId: string,
): Promise<number> {
  const url = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_KEY
  if (!url || !anon) {
    throw new Error('SUPABASE_URL e SUPABASE_KEY precisam estar no .env para o E2E rodar.')
  }

  return page.evaluate(
    async ({ url, anon, tenantId, contratoId }) => {
      const sessao = JSON.parse(localStorage.getItem('imob-portal-auth') || '{}')
      const params = new URLSearchParams({
        select: 'id',
        tenant_id: `eq.${tenantId}`,
        contract_id: `eq.${contratoId}`,
        published_at: 'not.is.null',
      })
      const r = await fetch(`${url}/rest/v1/portal_documents?${params}`, {
        headers: { apikey: anon, Authorization: `Bearer ${sessao.access_token}` },
      })
      const linhas: unknown = await r.json()
      if (!Array.isArray(linhas)) {
        throw new Error(`resposta inesperada do PostgREST (status ${r.status}): ${JSON.stringify(linhas)}`)
      }
      return linhas.length
    },
    { url, anon, tenantId, contratoId },
  )
}
