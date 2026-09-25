import { enviarLembretesDeLeadsParados } from '~~/server/utils/lead-alert'
import { purgeOldWhatsappClicks } from '~~/server/repositories/whatsapp-click.repository'

/**
 * Lembrete diário de leads parados (e a retenção dos cliques no WhatsApp). Chamado pelo cron da Vercel (ver
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

  const resultado = await enviarLembretesDeLeadsParados()

  // Retenção dos cliques no WhatsApp (ver 0046), pegando carona no único cron
  // do projeto: um segundo cron só para isto seria mais um segredo e mais uma
  // linha de config para lembrar. Falha aqui não pode esconder o resultado
  // do lembrete, que é o que alguém vai conferir no painel da Vercel.
  let cliquesLimpos = true
  try {
    await purgeOldWhatsappClicks(
      serviceSupabase(),
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    )
  } catch (e) {
    cliquesLimpos = false
    logError('whatsapp_click.retencao_falhou', { reason: errMessage(e) })
  }

  return { ...resultado, cliquesLimpos }
})

