import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Testes de unidade rodam em Node puro, sem subir o Nuxt.
 *
 * Escolha deliberada: o ambiente Nuxt de teste (@nuxt/test-utils) sobe o app
 * inteiro por suíte e leva dezenas de segundos — o que faz ninguém rodar o
 * teste. O que precisa de cobertura aqui é lógica pura e repositório com o
 * client injetado por parâmetro, que não dependem de runtime de framework.
 *
 * O preço é que os auto-imports do Nuxt não existem: `setup.ts` registra à mão
 * os poucos que o código de servidor usa.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
