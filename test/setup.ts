import { createError } from 'h3'

/**
 * O Nuxt auto-importa helpers do h3 no código de servidor; fora do runtime dele
 * esses nomes não existem. Registrar aqui evita ter que poluir o código de
 * produção com imports que só servem ao teste.
 */
Object.assign(globalThis, { createError })
