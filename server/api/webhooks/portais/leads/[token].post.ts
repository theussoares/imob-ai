import { PORTAL_LEADS_POR_HORA, lerLeadDoPortal } from '~~/shared/models/portal-lead'
import { countPortalLeadsSince, tenantByLeadsToken } from '~~/server/repositories/portal-feed.repository'
import { getTenantById } from '~~/server/repositories/tenant.repository'
import { receberLeadDoPortal } from '~~/server/utils/portal-leads'

/**
 * Webhook de leads do Canal Pro (ZAP, Viva Real, OLX).
 *
 * O Canal Pro não assina nem autentica a chamada (ver a 0063): o que prova de
 * qual imobiliária é o lead é o token secreto no caminho, que só ela colou lá.
 * O corpo nunca decide o tenant.
 *
 * Respostas — "só o código HTTP define o resultado", diz a spec deles:
 *   - 404 para token desconhecido ou recurso desligado: o Canal Pro mostra
 *     falha, e é o que queremos para uma URL errada;
 *   - 422 para lead sem o que a spec exige (código do anúncio, telefone);
 *   - 429 acima do teto por hora (`PORTAL_LEADS_POR_HORA`) — o Canal Pro
 *     reenvia depois;
 *   - 200 para gravado, atualizado ou repetido — o reenvio é esperado;
 *   - 500 só quando a gravação falhou: o Canal Pro reenvia até 3 vezes.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || ''
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const service = serviceSupabase()
  const cfg = await tenantByLeadsToken(service, token)
  const tenant = cfg ? await getTenantById(service, cfg.tenantId) : null
  // Recurso do CRM (0054): sem ele, a URL não existe — como a rota que não existe.
  if (!cfg || !tenant || !(await crmAtivo(tenant.id))) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const lead = lerLeadDoPortal(await readBody(event).catch(() => null))
  if (typeof lead === 'string') {
    logWarn('portal_lead.recusado', { tenant: tenant.slug, reason: lead })
    throw createError({ statusCode: 422, statusMessage: lead })
  }

  const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  if ((await countPortalLeadsSince(service, tenant.id, umaHora)) >= PORTAL_LEADS_POR_HORA) {
    logWarn('portal_lead.teto_por_hora', { tenant: tenant.slug })
    throw createError({ statusCode: 429, statusMessage: 'Muitos leads nesta hora' })
  }

  try {
    await receberLeadDoPortal(service, tenant, lead, { autoWhatsapp: cfg.autoWhatsapp })
    // Só `ok`: "criado" × "atualizado" diria a quem tem a URL se um telefone
    // já é cliente em aberto — e o Canal Pro só lê o código HTTP.
    return { ok: true }
  } catch (e) {
    // Sem nome nem telefone no log: dado pessoal de terceiro (ver log.ts).
    logError('portal_lead.nao_gravado', { tenant: tenant.slug, reason: errMessage(e) })
    throw createError({ statusCode: 500, statusMessage: 'Falha ao gravar' })
  }
})
