import type { Tenant } from '~~/shared/models/tenant'
import {
  emailLeadsParados,
  emailNovoLead,
  type CorpoEmail,
  type LeadDoAviso,
} from '~~/server/utils/email-templates'
import { enviarEmail } from '~~/server/utils/mailer'
import { destinatariosDoAviso, listarLeadsParados } from '~~/server/repositories/lead-alert.repository'
import { getTenantById } from '~~/server/repositories/tenant.repository'
import { portalOrigin } from '~~/server/utils/portal-origin'
import { ADMIN_HOST_PREFIX } from '~~/shared/utils/admin-host'

/**
 * Avisos de lead para a imobiliária.
 *
 * Existe por causa de um lead da OLMI em 09/09/2026 que ficou sem retorno: o
 * formulário gravava e não avisava ninguém, e o contato só existia para quem
 * abrisse o painel. Ver docs/superpowers/specs/2026-09-25-aviso-de-lead-design.md.
 *
 * Nada aqui lança para o chamador. O lead JÁ está gravado quando o aviso roda;
 * um provedor de e-mail fora do ar não pode virar "não foi possível registrar
 * seu contato" para o visitante — isso faria ele desistir de um contato que,
 * na verdade, chegou.
 */

/** Sai da plataforma, não da imobiliária: é um aviso interno, não fala com o cliente final. */
const REMETENTE = { nome: 'Moradi', endereco: '', replyTo: null }

/**
 * Endereço do quadro de leads no painel desta imobiliária, ou `null`.
 *
 * A origem sai do banco por `portalOrigin`, pela mesma razão de lá: o host da
 * requisição é dado do cliente, e este link vai para a caixa de entrada de quem
 * tem acesso ao painel. Um `X-Forwarded-Host` forjado no POST público do lead
 * faria o aviso apontar para uma tela de login falsa.
 *
 * `null` em vez de erro: o e-mail sem o link continua útil (tem o telefone e o
 * botão de WhatsApp); o e-mail que não sai, não.
 */
async function urlQuadroDeLeads(tenant: Tenant): Promise<string | null> {
  try {
    const origem = await portalOrigin(serviceSupabase(), tenant)
    return origem.replace('https://', `https://${ADMIN_HOST_PREFIX}`) + '/admin/leads'
  } catch {
    return null
  }
}

/**
 * Um e-mail por destinatário, e não um com todos em `to`: os membros de uma
 * imobiliária não precisam ver o endereço uns dos outros, e o `tenant.email`
 * costuma ser um e-mail público de contato.
 *
 * Devolve quantos saíram, para o cron registrar.
 */
async function enviarParaTodos(
  para: string[],
  corpo: CorpoEmail,
  tenant: Tenant,
  rotuloDeLog: string,
): Promise<number> {
  const resultados = await Promise.allSettled(
    para.map((endereco) =>
      enviarEmail({ para: endereco, ...corpo, remetente: REMETENTE, rotuloDeLog }),
    ),
  )
  const falhas = resultados.filter((r) => r.status === 'rejected').length
  if (falhas) {
    // Sem os endereços: log não leva PII (ver log.ts). O tenant basta para
    // alguém ir conferir.
    logError('lead_aviso.envio_falhou', { tenant: tenant.slug, falhas, total: para.length })
  }
  return resultados.filter((r) => r.status === 'fulfilled' && r.value.enviado).length
}

/**
 * Quanto o visitante pode esperar pelo aviso. O envio costuma levar menos de um
 * segundo; o teto existe para o dia em que o provedor travar — aí o visitante
 * recebe o "enviado" normalmente e o lembrete diário cobre o aviso perdido.
 */
const TETO_AVISO_MS = 4000

/** Aviso imediato de lead novo. Chamado depois da gravação; nunca lança. */
export async function avisarNovoLead(tenant: Tenant, lead: LeadDoAviso): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const teto = new Promise<'teto'>((ok) => {
    timer = setTimeout(() => ok('teto'), TETO_AVISO_MS)
  })
  const r = await Promise.race([enviarAvisoNovoLead(tenant, lead), teto])
  clearTimeout(timer)
  if (r === 'teto') logWarn('lead_aviso.teto_de_tempo', { tenant: tenant.slug })
}

async function enviarAvisoNovoLead(tenant: Tenant, lead: LeadDoAviso): Promise<void> {
  try {
    const para = await destinatariosDoAviso(serviceSupabase(), tenant)
    if (!para.length) {
      // O caso da OLMI de novo, só que agora gritando: lead chegou e não há
      // para quem avisar. Resolve cadastrando o e-mail em Configurações.
      logWarn('lead_aviso.sem_destinatario', { tenant: tenant.slug })
      return
    }
    const corpo = emailNovoLead({
      nomeImobiliaria: tenant.name,
      lead,
      urlPainel: await urlQuadroDeLeads(tenant),
    })
    await enviarParaTodos(para, corpo, tenant, 'lead.novo')
  } catch (e) {
    logError('lead_aviso.falhou', { tenant: tenant.slug, reason: errMessage(e) })
  }
}

const HORA = 60 * 60 * 1000

/**
 * Janela do lembrete diário, a partir de `agora`.
 *
 * - Parado há mais de 20h, e não 24h: o cron roda uma vez por dia no mesmo
 *   horário, e um lead que chegou às 9h05 de ontem ficaria de fora por cinco
 *   minutos e só entraria amanhã — dois dias sem retorno.
 * - Recebido nos últimos 7 dias: ver `listarLeadsParados` sobre a cauda.
 */
export function janelaDoLembrete(agora: Date): { recebidoDesde: string; paradoAntesDe: string } {
  return {
    recebidoDesde: new Date(agora.getTime() - 7 * 24 * HORA).toISOString(),
    paradoAntesDe: new Date(agora.getTime() - 20 * HORA).toISOString(),
  }
}

/** "09/09 às 14:32", no fuso de quem lê — o servidor roda em UTC. */
function quandoChegou(iso: string): string {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso))
  const p = (t: string) => f.find((x) => x.type === t)?.value ?? ''
  return `${p('day')}/${p('month')} às ${p('hour')}:${p('minute')}`
}

/**
 * Lembrete diário de leads parados, para todos os tenants.
 *
 * Um tenant que falha não derruba os outros: cada um tem seu try. O retorno é
 * só contagem, sem nome de lead — vai para a resposta do cron e para o log.
 */
export async function enviarLembretesDeLeadsParados(agora = new Date()) {
  const service = serviceSupabase()
  const parados = await listarLeadsParados(service, janelaDoLembrete(agora))

  const porTenant = new Map<string, typeof parados>()
  for (const l of parados) {
    porTenant.set(l.tenantId, [...(porTenant.get(l.tenantId) ?? []), l])
  }

  let emails = 0
  let tenantsComFalha = 0
  for (const [tenantId, leads] of porTenant) {
    try {
      const tenant = await getTenantById(service, tenantId)
      if (!tenant) continue
      const para = await destinatariosDoAviso(service, tenant)
      if (!para.length) {
        logWarn('lead_lembrete.sem_destinatario', { tenant: tenant.slug, leads: leads.length })
        continue
      }
      const corpo = emailLeadsParados({
        nomeImobiliaria: tenant.name,
        leads: leads.map((l) => ({ ...l, recebidoEm: quandoChegou(l.createdAt) })),
        urlPainel: await urlQuadroDeLeads(tenant),
      })
      emails += await enviarParaTodos(para, corpo, tenant, 'lead.lembrete')
    } catch (e) {
      tenantsComFalha++
      logError('lead_lembrete.falhou', { tenantId, reason: errMessage(e) })
    }
  }

  return { leads: parados.length, tenants: porTenant.size, emails, tenantsComFalha }
}
