import { defineConfig } from 'vitest/config'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('.', import.meta.url))

/**
 * A F1 (acesso do /gestao) chega em outra branch. Os endpoints da F3 importam
 * `gestao-auth` e `gestao-evento.repository` dela; enquanto os arquivos não
 * existem, o import aponta para cascas em `test/helpers/f1/` (e os testes usam
 * `vi.mock`). Assim que o arquivo real entra, o alias deixa de valer sozinho —
 * pode apagar `test/helpers/f1/` no merge da F1.
 */
const cascasDaF1 = [
  ['server/utils/gestao-auth', 'test/helpers/f1/gestao-auth.ts'],
  ['server/repositories/gestao-evento.repository', 'test/helpers/f1/gestao-evento.repository.ts'],
]
  .filter(([real]) => !existsSync(`${raiz}${real}.ts`))
  .map(([real, casca]) => ({ find: `~~/${real}`, replacement: `${raiz}${casca}` }))

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
    // `layers/*/test` junto: cada layer carrega os próprios testes de unidade.
    include: ['test/**/*.test.ts', 'layers/*/test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
  resolve: {
    // Array (e não objeto): as cascas da F1 precisam vir ANTES do alias genérico `~~`.
    alias: [...cascasDaF1, { find: '~~', replacement: raiz.replace(/\/$/, '') }],
  },
})
