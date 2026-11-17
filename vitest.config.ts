import { defineConfig } from 'vitest/config'
import { existsSync } from 'node:fs'
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
    // `layers/*/test` junto: cada layer carrega os próprios testes de unidade.
    include: ['test/**/*.test.ts', 'layers/*/test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
  resolve: {
    alias: [
      ...dependenciasAusentes(),
      { find: '~~', replacement: fileURLToPath(new URL('.', import.meta.url)) },
    ],
  },
})

/**
 * O backend do gestão foi construído em fases paralelas (F1 acesso, F2 vendas…),
 * cada uma na sua branch. `vi.mock` de um módulo que ainda não existe falha na
 * RESOLUÇÃO do import, antes de o mock valer; então, enquanto o arquivo real não
 * existe, o alias o aponta para um stub em `test/helpers/dependencias-ausentes/`.
 * Assim que a fase correspondente for mesclada o arquivo existe, o alias deixa de
 * valer sozinho e o módulo real passa a ser o resolvido (os testes seguem usando
 * `vi.mock` por cima). Alternativa descartada: criar o arquivo real vazio na
 * branch da fase dependente, que conflitaria no merge com a implementação de verdade.
 */
function dependenciasAusentes(): { find: string; replacement: string }[] {
  const modulos = [
    'server/utils/gestao-auth',
    'server/utils/gestao-acoes',
    'server/repositories/gestao-evento.repository',
  ]
  return modulos
    .filter((m) => !existsSync(fileURLToPath(new URL(`./${m}.ts`, import.meta.url))))
    .map((m) => ({
      find: `~~/${m}`,
      replacement: fileURLToPath(new URL(`./test/helpers/dependencias-ausentes/${m.split('/').pop()}.ts`, import.meta.url)),
    }))
}
