import type { Lead, LeadCreateInput } from '~~/shared/models/lead'
import type { NewLeadEvent } from '~~/shared/models/lead-activity'
import { createManualLead, deleteLead } from '~~/server/repositories/lead.repository'
import { createTask } from '~~/server/repositories/lead-activity.repository'
import { corretorDoTenant, registrarEventos } from '~~/server/utils/lead-crm'
import { getClickForConversion, markClickConverted } from '~~/server/repositories/whatsapp-click.repository'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Cadastro manual de um contato (lead que chegou por outro canal).
 *
 * Com `whatsappClickId`, é a conversão de um clique no WhatsApp: o imóvel sai
 * do clique, lido pelo client do membro (RLS) E com filtro de tenant — nunca
 * do body.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const body = await readBody<LeadCreateInput>(event)
  assertLeadCreateInput(body)
  const corretor = body.brokerId ? await corretorDoTenant(client, tenant.id, body.brokerId) : null

  /**
   * O que o cadastro traz além do lead: a anotação vira o primeiro registro
   * da linha do tempo, o retorno vira tarefa, e o responsável vira evento de
   * atribuição. Depois do lead gravado e sem derrubar a resposta — o contato
   * existir é o que importa; um buraco no histórico vai para o log.
   */
  async function completar(lead: Lead): Promise<Lead> {
    const eventos: NewLeadEvent[] = []
    const nota = body.notes?.trim()
    if (nota) eventos.push({ kind: 'nota', body: nota.slice(0, 4000), meta: {} })
    if (corretor) eventos.push({ kind: 'atribuicao', body: `Atribuído a ${corretor.name}`, meta: { brokerId: corretor.id } })
    await registrarEventos(client, tenant, lead.id, eventos, user.id)
    if (body.nextContactAt) {
      try {
        const t = await createTask(
          client,
          tenant.id,
          { leadId: lead.id, brokerId: corretor?.id ?? null, kind: 'retorno', title: 'Retornar contato', dueAt: body.nextContactAt },
          user.id,
        )
        return { ...lead, nextContactAt: t.dueAt }
      } catch (e) {
        logError('lead_tarefa.nao_gravada', { tenant: tenant.slug, reason: errMessage(e) })
      }
    }
    return lead
  }

  const clickId = body.whatsappClickId
  if (clickId == null || clickId === '') return completar(await createManualLead(client, tenant.id, body))

  if (!ehUuid(clickId)) throw createError({ statusCode: 422, statusMessage: 'Clique inválido.' })
  const click = await getClickForConversion(client, tenant.id, clickId)
  if (!click) throw createError({ statusCode: 404, statusMessage: 'Clique não encontrado.' })
  // Dois atendentes abrindo o mesmo clique criariam o mesmo contato duas vezes.
  if (click.leadId) throw createError({ statusCode: 409, statusMessage: 'Este clique já virou contato.' })

  const lead = await createManualLead(client, tenant.id, body, { propertyId: click.propertyId })
  let marcado: boolean
  try {
    marcado = await markClickConverted(client, tenant.id, clickId, lead.id)
  } catch (e) {
    // O contato já existe; falhar aqui faria a tela mostrar erro sobre um lead
    // que foi criado, e a pessoa cadastraria de novo. O custo é o clique
    // continuar com o botão "Virar contato" — visível, e inofensivo.
    logWarn('whatsapp_click.conversao_nao_marcada', { tenant: tenant.slug, reason: errMessage(e) })
    return completar(lead)
  }
  if (!marcado) {
    // Perdeu a corrida: outro atendente converteu o mesmo clique entre a nossa
    // leitura e agora. Desfaz este contato em vez de deixar dois iguais no
    // quadro — o do outro atendente é o que ficou ligado ao clique.
    await deleteLead(client, tenant.id, lead.id)
    throw createError({ statusCode: 409, statusMessage: 'Este clique já virou contato.' })
  }
  return completar(lead)
})
