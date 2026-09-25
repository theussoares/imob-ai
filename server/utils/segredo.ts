import { timingSafeEqual } from 'node:crypto'

/**
 * Segredos que precisam valer em EXECUÇÃO, e não só no build.
 *
 * ## O incidente que originou este arquivo (17/09/2026)
 *
 * A chave do provedor de e-mail estava configurada na Vercel, o convite não
 * saía, e não havia log nenhum. A causa não estava no código de envio.
 *
 * `nuxt.config.ts` é avaliado no BUILD. Um `process.env.MAIL_API_KEY || ''` ali
 * não é uma leitura de ambiente em produção: é um valor congelado no bundle.
 * Está literalmente no arquivo gerado, como `mailApiKey: ""`.
 *
 * O Nitro tem sim um caminho de runtime — `useRuntimeConfig(event)` chama
 * `applyEnv` a cada requisição —, mas ele só enxerga variáveis prefixadas com
 * `NUXT_` (`envPrefix: "NUXT_"`, também assado no bundle). O nome sem prefixo,
 * que é o que está configurado hoje, nunca é lido em execução.
 *
 * ## Por que não simplesmente renomear tudo para `NUXT_`
 *
 * Seria o caminho idiomático, e ele continua sendo o preferido — a precedência
 * abaixo coloca o `runtimeConfig` em primeiro lugar justamente por isso. Mas
 * renomear é um degrau com janela de falha: entre trocar o nome no painel e o
 * deploy sair, o envio fica sem chave. Aceitar os dois nomes torna a migração
 * opcional e reversível, e o custo é este arquivo.
 *
 * ## O que isto NÃO resolve
 *
 * Se a Vercel entrega uma variável ALTERADA para uma função já implantada sem
 * redeploy. A documentação deles diz que é preciso redeploy. Este arquivo
 * remove uma das duas condições de falha — a do nome —, não a outra.
 */

/** Valor utilizável, ou string vazia. Nunca `undefined`, nunca com espaço. */
function limpo(v: string | null | undefined): string {
  return (v ?? '').trim()
}

/**
 * Lê um segredo pelo caminho que funcionar.
 *
 * Precedência, e o motivo de cada degrau:
 *  1. `runtimeConfig` — cobre o `.env` de desenvolvimento e a variável
 *     `NUXT_`-prefixada, que o Nitro aplica por requisição. É o caminho certo.
 *  2. `process.env[nome]` lido AQUI — o nome sem prefixo, que só existia no
 *     build. A leitura sobrevive no bundle do servidor (ao contrário do
 *     `nuxt.config.ts`, este arquivo roda dentro da função).
 *
 * O `trim` não é preciosismo: chave colada do painel vem com quebra de linha no
 * fim mais vezes do que se imagina, e quebra de linha em valor de cabeçalho HTTP
 * faz o `fetch` lançar — com um erro que não menciona a chave em lugar nenhum.
 */
export function segredoDeRuntime(doConfig: string | null | undefined, nomeNoAmbiente: string): string {
  return limpo(doConfig) || limpo(process.env[nomeNoAmbiente])
}

/**
 * Quais segredos estão faltando, para a linha de arranque.
 *
 * ⚠️ Devolve só os NOMES dos ausentes. Um segredo presente não pode aparecer
 * aqui nem parcialmente: o retorno vai para o log, que é lido por mais gente
 * que o painel da Vercel.
 *
 * Existe porque o modo de falha do incidente foi a ausência de sinal, não um
 * sinal errado. Uma linha por cold start dizendo o que falta transforma "não
 * teve nenhum log" em uma resposta de dez segundos.
 */
export function segredosAusentes(valores: Record<string, string | null | undefined>): string[] {
  return Object.keys(valores).filter((nome) => !limpo(valores[nome]))
}

/**
 * Compara um segredo recebido com o esperado em tempo constante.
 *
 * Com `===`, a resposta sai mais rápido quanto antes aparece o primeiro
 * caractere errado — e dá para descobrir o segredo letra a letra medindo o
 * tempo. O tamanho diferente vaza, e isso é aceito: o que protege é o conteúdo.
 */
export function mesmoSegredo(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}
