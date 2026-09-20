import { defineConfig } from '@playwright/test'

// O `.env` é lido aqui, não pelo Nuxt: o Playwright roda fora do app e precisa
// da service role para provisionar. `loadEnvFile` é do Node 22 — evita somar
// `dotenv` ao projeto por causa de uma linha.
process.loadEnvFile('.env')

export default defineConfig({
  testDir: './e2e',
  // Serial de propósito. Os testes compartilham UM tenant e UM contrato, e o
  // `?tenant=` do dev grava cookie — paralelizar faria uma worker trocar o
  // tenant debaixo da outra.
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
    // Reusa o dev server que já estiver de pé: subir o Nuxt leva dezenas de
    // segundos e quem roda isto local costuma já ter um aberto.
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
