import { markClickConverted } from '~~/server/repositories/whatsapp-click.repository'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Liga o clique a um contato que JÁ existe (MELHORIA 11): a pessoa foi
 * cadastrada à mão antes de alguém casar o clique. "Virar contato" criaria um
 * duplicado; dispensar perderia a origem (imóvel e horário).
 *
 * O lead de outra imobiliária é barrado pela policy de update da 0046
 * (`exists ... l.tenant_id = whatsapp_clicks.tenant_id`), e aqui o update já
 * vai com o tenant da sessão.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ leadId?: string }>(event)
  if (!body?.leadId || !ehUuid(body.leadId)) throw createError({ statusCode: 422, statusMessage: 'Escolha o contato.' })
  const { data: lead } = await client.from('leads').select('id').eq('tenant_id', tenant.id).eq('id', body.leadId).maybeSingle()
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'Contato não encontrado.' })
  const ok = await markClickConverted(client, tenant.id, id, lead.id)
  if (!ok) throw createError({ statusCode: 409, statusMessage: 'Este clique já foi ligado a um contato.' })
  return { ok: true }
})
