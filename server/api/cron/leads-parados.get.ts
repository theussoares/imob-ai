import { enviarLembretesDeLeadsParados } from '~~/server/utils/lead-alert'

/**
 * Lembrete diário de leads parados. Chamado pelo cron da Vercel (ver
 * `nitro.vercel.config.crons` em nuxt.config.ts).
 *
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sem conferir, esta URL
 * seria um botão público de "dispare e-mails para todas as imobiliárias" — e
 * cada disparo gasta a cota do provedor e ensina o cliente a ignorar o aviso.
 *
 * Sem `CRON_SECRET` configurado a rota RECUSA, em vez de rodar aberta: o
 * lembrete que não sai aparece no log do cron como 503; o que roda aberto não
 * aparece em lugar nenhum.
 */
export default defineEventHandler(async (event) => {
  const segredo = segredoDeRuntime(useRuntimeConfig().cronSecret, 'CRON_SECRET')
  if (!segredo) {
    logError('cron.segredo_ausente', { rota: 'leads-parados' })
    throw createError({ statusCode: 503, statusMessage: 'Cron não configurado.' })
  }

  if (!mesmoSegredo(getHeader(event, 'authorization') || '', `Bearer ${segredo}`)) {
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado.' })
  }

  return enviarLembretesDeLeadsParados()
})

