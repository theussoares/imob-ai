import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant } from '~~/shared/models/tenant'
import type { LeadDoPortal } from '~~/shared/models/portal-lead'
import { PORTAL_WHATSAPP_AUTOMATICO_POR_DIA, nomeParaSaudacao } from '~~/shared/models/portal-lead'
import { LEAD_TYPE_LABELS, seekingTypeFor } from '~~/shared/models/lead'
import { MODELO_IDIOMA, telefonesDoWaId } from '~~/shared/models/whatsapp'
import { formatPropertyCode } from '~~/shared/utils/property-specs'
import { createLead, findOpenLeadByPhones } from '~~/server/repositories/lead.repository'
import { findPropertyByDisplayCode } from '~~/server/repositories/property.repository'
import {
  claimPortalLead,
  countPortalLeadsSince,
  markPortalLeadWhatsapp,
  releasePortalLead,
  setPortalLeadReceipt,
} from '~~/server/repositories/portal-feed.repository'
import { avisarNovoLead } from '~~/server/utils/lead-alert'
import { distribuirPelaRoleta, registrarEventos } from '~~/server/utils/lead-crm'
import { whatsappAtivo } from '~~/server/utils/entitlement'
import { iniciarConversaComModelo } from '~~/server/utils/whatsapp-envio'

type Client = SupabaseClient<Database>

export type ResultadoDoPortal = 'criado' | 'atualizado' | 'repetido'

/** O modelo do primeiro contato automático — o sugerido, de variáveis conhecidas (nome, imobiliária). */
const MODELO_AUTOMATICO = 'moradi_primeiro_contato'

/**
 * Grava o lead que o portal mandou.
 *
 * - Reenvio (mesmo `originLeadId`): nada acontece.
 * - Telefone que já tem lead em aberto: vira anotação no histórico dele, e
 *   não card novo — é a mesma pessoa perguntando de outro imóvel, e dois
 *   cards fariam dois corretores ligarem para ela.
 * - Senão: lead novo, roleta e aviso, como o do formulário do site.
 *
 * Lança quando a GRAVAÇÃO falha, depois de soltar a reserva: o webhook
 * responde 500, o Canal Pro reenvia, e o reenvio encontra a vaga livre.
 */
export async function receberLeadDoPortal(
  service: Client,
  tenant: Tenant,
  lead: LeadDoPortal,
  opcoes: { autoWhatsapp: boolean },
): Promise<ResultadoDoPortal> {
  if (!(await claimPortalLead(service, tenant.id, lead.originLeadId))) return 'repetido'

  let leadId: string | null = null
  let novo = false
  let imovel: Awaited<ReturnType<typeof findPropertyByDisplayCode>> = null
  try {
    imovel = lead.codigoDoImovel ? await findPropertyByDisplayCode(service, tenant.id, lead.codigoDoImovel) : null
    const textoDoHistorico = [
      lead.resumo,
      imovel ? `Imóvel ${formatPropertyCode(imovel.code)}` : lead.codigoDoImovel ? `Anúncio ${lead.codigoDoImovel} (não encontrado entre os publicados)` : null,
      lead.mensagem ? `“${lead.mensagem}”` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const existente = await findOpenLeadByPhones(service, tenant.id, telefonesDoWaId('55' + lead.telefone))
    if (existente) {
      leadId = existente.id
      novo = false
      await registrarEventos(service, tenant, leadId, [{ kind: 'nota', body: textoDoHistorico, meta: {} }], null)
    } else {
      leadId = await createLead(service, {
        tenantId: tenant.id,
        propertyId: imovel?.id ?? null,
        name: lead.nome,
        phone: lead.telefone,
        ipHash: null,
        message: lead.mensagem,
        // Sem origem `portal` em `leads.source`, pelo mesmo motivo do WhatsApp
        // (spec de 29/09): o de onde veio fica no histórico.
        source: 'outro',
        leadType: imovel ? seekingTypeFor(imovel.purpose) : lead.tipo,
      })
      novo = true
      await registrarEventos(service, tenant, leadId, [{ kind: 'nota', body: textoDoHistorico, meta: {} }], null)
    }
  } catch (e) {
    // Só solta a reserva se o lead NÃO foi gravado. Com o lead gravado, soltar
    // faria o reenvio achá-lo pelo telefone e tratá-lo como "atualizado" — e
    // ele nunca passaria pela roleta nem pelo aviso (achado da revisão).
    if (!leadId) {
      await releasePortalLead(service, tenant.id, lead.originLeadId).catch((e2) =>
        logError('portal_lead.reserva_presa', { tenant: tenant.slug, reason: errMessage(e2) }),
      )
      throw e
    }
    logError('portal_lead.pos_gravacao_falhou', { tenant: tenant.slug, reason: errMessage(e) })
  }
  // O vínculo do recibo é conveniência (dizer qual lead veio de qual id do
  // portal); a trava contra reenvio já é a linha do recibo.
  await setPortalLeadReceipt(service, tenant.id, lead.originLeadId, leadId).catch((e) =>
    logError('portal_lead.recibo_sem_lead', { tenant: tenant.slug, reason: errMessage(e) }),
  )

  if (!novo) return 'atualizado'

  // Daqui para baixo nada lança: o lead já está gravado e o recibo também.
  const corretor = await distribuirPelaRoleta(service, tenant, leadId)
  await avisarNovoLead(
    tenant,
    {
      nome: lead.nome,
      telefone: lead.telefone,
      mensagem: lead.mensagem,
      tipo: LEAD_TYPE_LABELS[imovel ? seekingTypeFor(imovel.purpose) : lead.tipo],
      imovel: imovel ? { codigo: formatPropertyCode(imovel.code), titulo: imovel.title } : null,
    },
    corretor?.email ? [corretor.email] : [],
  )

  if (opcoes.autoWhatsapp && (await whatsappAtivo(tenant.id))) {
    try {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      if ((await countPortalLeadsSince(service, tenant.id, desde, true)) >= PORTAL_WHATSAPP_AUTOMATICO_POR_DIA) {
        logWarn('portal_lead.teto_whatsapp', { tenant: tenant.slug })
        return 'criado'
      }
      await iniciarConversaComModelo(service, tenant, null, { id: leadId, name: lead.nome, phone: lead.telefone }, {
        name: MODELO_AUTOMATICO,
        language: MODELO_IDIOMA,
        values: [nomeParaSaudacao(lead.nome), tenant.name],
      })
      await markPortalLeadWhatsapp(service, tenant.id, lead.originLeadId)
    } catch (e) {
      // O motivo mais comum é o modelo ainda em análise na Meta. O lead já
      // está no funil e o corretor foi avisado; a mensagem automática é bônus.
      logWarn('portal_lead.whatsapp_automatico_falhou', { tenant: tenant.slug, reason: errMessage(e) })
    }
  }
  return 'criado'
}
