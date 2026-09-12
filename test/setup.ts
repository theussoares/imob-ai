import { createError } from 'h3'
import { errMessage, logError, logWarn } from '~~/server/utils/log'

/**
 * O Nuxt auto-importa helpers do h3 no código de servidor; fora do runtime dele
 * esses nomes não existem. Registrar aqui evita ter que poluir o código de
 * produção com imports que só servem ao teste.
 *
 * Os helpers de log entram pela mesma razão, e são os DE VERDADE, não stubs:
 * um caminho de erro que só é exercitado no teste (banco fora, leitura que
 * falha) quebrava com `logWarn is not defined` em vez de devolver o fallback —
 * ou seja, o teste falhava por causa do andaime, não do comportamento.
 */
Object.assign(globalThis, { createError, logWarn, logError, errMessage })
