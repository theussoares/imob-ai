/**
 * Quando perguntar ao servidor se existe versão nova do painel.
 *
 * O `registerSW` confere só no registro, ou seja, quando o app ABRE do zero. No
 * celular o app instalado fica em memória: quem volta a ele depois de dois dias
 * continua na versão antiga, e o aviso de atualização nunca aparece porque
 * ninguém perguntou de novo. Os gatilhos que corrigem isso (voltar para a
 * frente, relógio de 30 min) disparam bem mais do que precisam — alternar de
 * app várias vezes num minuto é comum —, então a pergunta passa por aqui.
 *
 * Separado do plugin para ser testável em Node, sem service worker.
 */

/** Entre duas perguntas, no mínimo isto. Cada uma é um GET do `sw.js`. */
export const INTERVALO_MINIMO_MS = 60_000

/** Com o app aberto e na frente, pergunta de novo a cada tanto. */
export const INTERVALO_PERIODICO_MS = 30 * 60_000

export function criarVerificadorDeAtualizacao(opts: {
  /** `registration.update()` — baixa o `sw.js` e, se mudou, instala o novo. */
  atualizar: () => Promise<unknown>
  /** Sem rede, a pergunta só gera erro no console. */
  online: () => boolean
  agora?: () => number
}) {
  const agora = opts.agora ?? Date.now
  // Começa em "agora" e não em -Infinity: o verificador nasce no
  // `onRegisteredSW`, e o registro acabou de conferir o `sw.js`.
  let ultima = agora()
  let emAndamento = false

  /** Devolve se de fato perguntou — útil para o teste, ignorado pelo plugin. */
  return async function verificar(): Promise<boolean> {
    if (emAndamento || !opts.online()) return false
    if (agora() - ultima < INTERVALO_MINIMO_MS) return false

    ultima = agora()
    emAndamento = true
    try {
      await opts.atualizar()
      return true
    } catch {
      // Falha aqui (rede instável, servidor em deploy) não é problema da
      // pessoa: a próxima volta ao app pergunta de novo. Propagar viraria erro
      // não tratado a cada troca de aba.
      return false
    } finally {
      emAndamento = false
    }
  }
}
