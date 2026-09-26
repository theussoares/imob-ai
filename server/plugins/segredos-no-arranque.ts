import { segredoDeRuntime, segredosAusentes } from '~~/server/utils/segredo'

/**
 * Uma linha por arranque dizendo quais segredos NÃO chegaram.
 *
 * ## Por que isto existe
 *
 * Em 17/09/2026 o convite do portal parou de sair. A chave do provedor estava
 * configurada na Vercel, o envio não acontecia, e — o pior detalhe — **não havia
 * log nenhum**. A depuração levou horas e passou por duas hipóteses erradas
 * antes de alguém medir o comportamento real.
 *
 * A causa era `nuxt.config.ts` ser avaliado no BUILD (ver `server/utils/segredo.ts`).
 * Mas o custo não veio da causa: veio de o sistema não ter dito nada. O código
 * de envio só reclama quando alguém tenta mandar um e-mail, e quem descobre o
 * problema nesse momento é a imobiliária, não nós.
 *
 * Esta linha inverte isso. O deploy diz na hora o que está faltando, antes de
 * alguém clicar em qualquer botão.
 *
 * ## Por que `logError` e não `logWarn`
 *
 * Nenhum destes segredos é opcional em produção. Sem `supabaseServiceKey` toda
 * escrita pública cai; sem `mailApiKey` nenhum convite sai. A convenção do
 * `log.ts` é explícita: "falha que custa algo ao negócio (lead perdido, config
 * ausente)".
 *
 * ## Silêncio é o estado bom
 *
 * Com tudo presente, este plugin não imprime nada. Log de arranque que sai
 * sempre vira ruído que ninguém lê — e era exatamente de um log legível que
 * faltava no dia do incidente.
 *
 * ⚠️ Só os NOMES do que falta. Nunca o valor, nem um prefixo dele: o log da
 * Vercel é lido por mais gente que o painel de variáveis.
 */
export default defineNitroPlugin(() => {
  // Fora de produção a ausência é normal e esperada — dá para desenvolver o
  // fluxo inteiro sem conta em provedor de e-mail (ver `mailer.ts`). Gritar
  // aqui treinaria todo mundo a ignorar a linha, que é como um alerta morre.
  if (process.env.NODE_ENV !== 'production') return

  const config = useRuntimeConfig()

  const faltando = segredosAusentes({
    SUPABASE_URL: segredoDeRuntime(config.public.supabaseUrl, 'SUPABASE_URL'),
    SUPABASE_KEY: segredoDeRuntime(config.public.supabaseKey, 'SUPABASE_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: segredoDeRuntime(
      config.supabaseServiceKey,
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
    MAIL_API_KEY: segredoDeRuntime(config.mailApiKey, 'MAIL_API_KEY'),
    MAIL_FROM: segredoDeRuntime(config.mailFrom, 'MAIL_FROM'),
    RATE_LIMIT_IP_SALT: segredoDeRuntime(config.rateLimitIpSalt, 'RATE_LIMIT_IP_SALT'),
  })

  if (!faltando.length) return

  logError('config.segredos_ausentes', {
    faltando,
    // A dica que resolve o caso mais provável. Sem ela esta linha diz o QUE
    // falta e deixa a pessoa no mesmo lugar onde a depuração de 17/09 começou:
    // "mas está configurado no painel".
    dica: 'Nome sem prefixo só vale no build. Use NUXT_<NOME> para valer em runtime, e redeploy após alterar.',
  })
})
