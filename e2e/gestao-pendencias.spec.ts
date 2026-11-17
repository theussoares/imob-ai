import { expect, test, type Page } from '@playwright/test'

/**
 * Fila de pendências do Financeiro (`/gestao/financeiro`).
 *
 * Usa o acesso rápido do demo (`NUXT_PUBLIC_GESTAO_DEMO`, ligado em
 * `playwright.config.ts`) e o seed da locação, que vive no localStorage do
 * navegador: não provisiona tenant nem toca o banco, ao contrário dos outros
 * specs. O que ele trava é o motivo da fila existir — registrar pagamento e
 * repasse sem abrir a etapa 7 do contrato — e que a ação seja a mesma do
 * contrato (a locação some da fila e o histórico fica na locação).
 *
 * Seed de L-2026-0001: uma cobrança vencida e em aberto e uma paga com repasse
 * pendente. A L-2026-0002 já tem o repasse feito e não deve aparecer.
 */

async function entrarComo(page: Page, perfil: 'dono' | 'recepcao') {
  await page.goto('/gestao/login')
  // Sem esperar a hidratação o clique corre na frente do `@submit.prevent` (ver `painel.ts`).
  await page.waitForLoadState('networkidle')
  await page.getByTestId(`perfil-${perfil}`).check()
  await page.getByTestId('entrar').click()
  await expect(page).toHaveURL(/\/gestao\/vendas/)
}

test('dono registra pagamento e repasse pela fila, sem abrir o contrato', async ({ page }) => {
  await entrarComo(page, 'dono')
  await page.goto('/gestao/financeiro')
  await page.waitForLoadState('networkidle')

  const receber = page.getByTestId('fin-pend-receber-item')
  const repassar = page.getByTestId('fin-pend-repassar-item')
  await expect(receber).toHaveCount(1)
  await expect(receber.first()).toContainText('Em atraso')
  await expect(repassar).toHaveCount(1)

  // Pagar o aluguel atrasado: sai de «a receber» e o repasse dele entra na fila.
  await receber.first().getByTestId('fin-pagar-exemplo').click()
  await expect(page.getByText('Pagamento registrado.')).toBeVisible()
  await expect(receber).toHaveCount(0)
  await expect(repassar).toHaveCount(2)

  // Repassar um deles: a fila encolhe.
  await repassar.first().getByTestId('fin-repassar-exemplo').click()
  await expect(page.getByText('Repasse registrado.')).toBeVisible()
  await expect(repassar).toHaveCount(1)

  // Mesma ação do contrato: a cobrança aparece como paga na etapa 7 da locação.
  await page.goto('/gestao/locacao/L-2026-0001')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('etapa-7').click()
  await expect(page.getByTestId('cobrancas').getByText('Em aberto')).toHaveCount(0)
})

test('recepção não vê o Financeiro nem a fila', async ({ page }) => {
  await entrarComo(page, 'recepcao')
  await page.goto('/gestao/financeiro')
  await expect(page.getByTestId('fin-pendencias')).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/gestao\/financeiro/)
})
