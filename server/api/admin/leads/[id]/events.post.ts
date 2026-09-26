import type { LeadEventInput } from '~~/shared/models/lead-activity'
import { insertLeadEvents } from '~~/server/repositories/lead-activity.repository'

/**
 * Registro manual de atendimento (anotação, ligação, WhatsApp, e-mail, visita).
 *
 * Só os tipos manuais passam pelo validador: 'etapa', 'atribuicao' e 'tarefa'
 * são do servidor, e aceitá-los daqui deixaria qualquer membro escrever um
 * "movido para Fechado" que nunca aconteceu.
 *
 * Aqui o erro SOBE, ao contrário dos eventos de sistema: o registro é a própria
 * ação, e a tela precisa saber que ele não entrou.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const leadId = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<LeadEventInput>(event)
  assertLeadEventInput(body)

  const [criado] = await insertLeadEvents(
    client,
    tenant.id,
    leadId,
    [{ kind: body.kind, body: body.body.trim(), meta: {}, occurredAt: body.occurredAt || null }],
    user.id,
  ).catch((e) => {
    // FK composta (0049): lead inexistente ou de outro tenant.
    if ((e as { code?: string })?.code === '23503') {
      throw createError({ statusCode: 404, statusMessage: 'Contato não encontrado.' })
    }
    throw e
  })
  return criado
})
