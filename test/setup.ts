import { createError } from 'h3'
import { segredoDeRuntime } from '~~/server/utils/segredo'

/**
 * O Nuxt auto-importa helpers do h3 no código de servidor; fora do runtime dele
 * esses nomes não existem. Registrar aqui evita ter que poluir o código de
 * produção com imports que só servem ao teste.
 */
Object.assign(globalThis, { createError })

/**
 * `logWarn`/`logError` também são auto-import (server/utils/log.ts). No teste
 * viram no-op: o que importa é o código chegar na linha, não o que sai no
 * console — e a saída real encheria o relatório de JSON.
 */
Object.assign(globalThis, {
  logWarn: () => {},
  logError: () => {},
  errMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
})

/**
 * `segredoDeRuntime` (server/utils/segredo.ts) também é auto-import.
 *
 * Aqui vai a implementação DE VERDADE, não um no-op: ela decide de onde o
 * segredo vem, e um dublê que devolvesse sempre o primeiro argumento esconderia
 * exatamente a regressão que ela existe para evitar.
 */
Object.assign(globalThis, { segredoDeRuntime })
