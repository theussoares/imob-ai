import { defineConfig } from '@playwright/test'

// O `.env` é lido aqui, não pelo Nuxt: o Playwright roda fora do app e precisa
// da service role para provisionar. `loadEnvFile` é do Node 22 — evita somar
// `dotenv` ao projeto por causa de uma linha.
process.loadEnvFile('.env')

export default defineConfig({
  testDir: './e2e',
  // Varre resíduo de execuções anteriores ANTES de qualquer spec provisionar —
  // ver o comentário em `e2e/support/global-setup.ts` para o porquê de isto
  // não estar dentro de um teste.
  globalSetup: './e2e/support/global-setup.ts',
  // Serial de propósito, mas não porque os testes compartilhem tenant: cada
  // spec (menos `fumaca`, que não provisiona nada) chama `criarAmbiente()` uma
  // vez só para si — seis tenants descartáveis, vinte e quatro contas de Auth,
  // trinta e seis documentos e trinta e seis objetos no bucket de PRODUÇÃO por
  // execução completa da suíte. `workers: 1` está aqui por um motivo que,
  // sozinho, já bastaria: o `?tenant=` do dev grava cookie, e paralelizar
  // faria uma worker trocar o tenant debaixo da outra.
  workers: 1,
  fullyParallel: false,
  // Sem retry: teste de vazamento que passa "na segunda" é teste que ninguém
  // acredita. Falhou, é para olhar.
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    // Padrão do Playwright, não `true` fixo: local, reusa o dev server que já
    // estiver de pé na 3000 — subir o Nuxt leva dezenas de segundos e quem
    // roda isto na máquina costuma já ter um aberto (a conveniência que este
    // comentário sempre existiu para justificar). No CI, `!process.env.CI`
    // vira `false` e força um servidor novo: sem isso, uma porta 3000 ocupada
    // por outra branch faria a suíte — que existe para travar regressão antes
    // do merge, com `retries: 0` — rodar contra código que não é o desta PR e
    // reportar verde sobre ele. Um verde falso aqui custa o propósito inteiro
    // da suíte.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
