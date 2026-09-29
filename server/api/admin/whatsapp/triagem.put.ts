import { TRIAGEM_MODOS, type TriagemModo } from '~~/shared/models/triagem'
import { setTriagemModo } from '~~/server/repositories/whatsapp.repository'
import { conexaoDoTenant } from '~~/server/utils/whatsapp-envio'

/**
 * Liga ou desliga a triagem automática do número. Só o owner: o robô fala
 * com o cliente em nome da imobiliária, e cada mensagem dele pode ser cobrada
 * pela Meta na conta dela.
 */
export default defineEventHandler(async (event) => {
  const { tenant, membership } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode mudar a triagem.' })
  }
  const body = await readBody<{ modo?: unknown }>(event)
  if (!TRIAGEM_MODOS.includes(body?.modo as TriagemModo)) throw createError({ statusCode: 422, statusMessage: 'Modo inválido.' })
  const service = serviceSupabase()
  const { conta } = await conexaoDoTenant(service, tenant.id)
  await setTriagemModo(service, tenant.id, conta.id, body.modo as TriagemModo)
  return { ok: true }
})
