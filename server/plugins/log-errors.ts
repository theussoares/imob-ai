/**
 * Uma linha de log para toda falha inesperada de requisição.
 *
 * ## Por que um hook global, e não um try/catch por endpoint
 *
 * O log deste projeto são onze pontos colocados à mão — lead público, auth,
 * rate limit, favicon. A lacuna que custou caro foi exatamente onde ninguém
 * colocou um: nenhum caminho de escrita do painel registrava nada. Em 28/08
 * uma cliente bateu três vezes num erro de cadastro e o que sobrou foi um
 * stack cru na Vercel, sem imobiliária, sem usuário, sem o código do imóvel.
 *
 * Instrumentar endpoint por endpoint reproduz o mesmo problema: cobre o que
 * lembramos hoje e deixa de fora o endpoint que alguém escrever amanhã. Aqui é
 * um lugar só, e o que vier depois já nasce coberto.
 *
 * ## O payload
 *
 * `readBody` do h3 guarda o corpo já parseado no próprio `req` e devolve o
 * cache quando chamado de novo — então ler aqui não relê o stream nem compete
 * com o handler. Quando o erro acontece antes do parse não há cache, a leitura
 * falha e a linha sai sem `payload`: o resto continua valendo, e não vale
 * complicar por esse caso.
 *
 * O que pode aparecer no `payload` é decidido em `error-log.ts` por lista de
 * permissão. Nada de pessoa passa por aqui.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, { event }) => {
    if (!event) return

    const statusCode = Number((error as { statusCode?: number }).statusCode ?? 500)
    const unhandled = (error as { unhandled?: boolean }).unhandled === true
    if (!shouldLog(statusCode, unhandled)) return

    const payload = await readBody(event).catch(() => undefined)

    logError('request.failed', {
      method: event.method,
      path: event.path,
      status: statusCode,
      unhandled,
      // A imobiliária, não a pessoa: estreita o suficiente para achar o caso e
      // não é dado de ninguém. Ver o cabeçalho de log.ts.
      tenant: event.context.tenant?.slug,
      errorCode: errorCode(error),
      reason: errorReason(error),
      payload: redactPayload(payload),
    })
  })
})
