import { varrerAmbientesAntigos } from './tenant'

/**
 * Varre resíduo de execuções anteriores ANTES de qualquer spec provisionar.
 *
 * Não é um teste — é `globalSetup` do Playwright (ver `playwright.config.ts`),
 * que roda uma vez por execução, antes de todos os arquivos. Antes, a varredura
 * só acontecia dentro de um teste em `provisionamento.spec.ts`; a ordem
 * alfabética do Playwright coloca esse arquivo em 6º lugar, depois de cinco
 * specs já terem chamado `criarAmbiente()` — e rodar um spec isolado
 * (`pnpm test:e2e e2e/audiencia.spec.ts`, o modo em que mais se dá `Ctrl+C`)
 * nunca chegava a executar aquele teste. "Antes de qualquer criação, o setup
 * varre" só vira verdade morando aqui, fora de qualquer spec.
 */
export default async function globalSetup(): Promise<void> {
  const apagados = await varrerAmbientesAntigos()
  if (apagados > 0) {
    console.log(`[e2e] varredura: ${apagados} ambiente(s) de execuções anteriores removido(s).`)
  }
}
