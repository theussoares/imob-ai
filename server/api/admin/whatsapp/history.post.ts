import type { WhatsappHistoryMode } from '~~/shared/models/whatsapp'
import { ACEITE_DO_HISTORICO, podePedirHistorico } from '~~/shared/models/whatsapp'
import { markHistoryRequested, setHistoryStatus } from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { ErroDoWhatsapp } from '~~/server/services/whatsapp/provider'
import { conexaoDoTenant } from '~~/server/utils/whatsapp-envio'

/**
 * Pede à Meta o histórico do app WhatsApp Business (Coexistence).
 *
 * Só o owner, com o aceite: o histórico traz conversa de terceiros que nunca
 * foram clientes, e quem decide trazer para o sistema é a imobiliária, como
 * controladora. O aceite é o TEXTO exato que a tela mostrou — um booleano
 * `true` no body não diria o que foi aceito.
 *
 * O aceite é gravado ANTES de pedir: o webhook descarta histórico sem pedido
 * registrado, e a Meta pode começar a mandar antes de esta resposta sair.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user, membership } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode importar o histórico.' })
  }
  const body = await readBody<{ mode?: unknown; aceite?: unknown }>(event)
  const mode = body?.mode === 'so_leads' || body?.mode === 'tudo' ? (body.mode as WhatsappHistoryMode) : null
  if (!mode) throw createError({ statusCode: 422, statusMessage: 'Escolha quais conversas importar.' })
  if (body?.aceite !== ACEITE_DO_HISTORICO) {
    throw createError({ statusCode: 422, statusMessage: 'Para importar, é preciso marcar o aceite.' })
  }

  const service = serviceSupabase()
  const { conta, conexao } = await conexaoDoTenant(service, tenant.id)
  if (!podePedirHistorico(conta, new Date())) {
    throw createError({
      statusCode: 409,
      statusMessage: conta.coexistencia
        ? 'O prazo de 24h da Meta para pedir o histórico já passou, ou ele já foi pedido.'
        : 'O histórico só existe para número conectado pelo app WhatsApp Business.',
    })
  }

  await markHistoryRequested(service, tenant.id, conta.id, { mode, userId: user.id, status: 'solicitado' })
  logWarn('whatsapp.historico_pedido', { tenant: tenant.slug, mode })
  try {
    const meta = cloudApi()
    // A agenda primeiro: é dela que saem os nomes das conversas importadas.
    await meta.pedirSincronizacao(conexao, 'smb_app_state_sync')
    await meta.pedirSincronizacao(conexao, 'history')
  } catch (e) {
    await setHistoryStatus(service, tenant.id, conta.id, 'falhou')
    if (e instanceof ErroDoWhatsapp) throw createError({ statusCode: 422, statusMessage: `A Meta não aceitou o pedido: ${e.message}` })
    throw e
  }
  return { ok: true }
})
