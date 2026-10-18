import type { WhatsappTemplate } from '~~/shared/models/whatsapp'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { conexaoDoTenant, erroDoEnvio } from '~~/server/utils/whatsapp-envio'

/**
 * Os modelos da conta do WhatsApp Business da imobiliária, direto da Meta.
 * Sem cache: o status muda lá (aprovado, pausado) e a tela tem que dizer a
 * verdade no momento do envio.
 */
export default defineEventHandler(async (event): Promise<WhatsappTemplate[]> => {
  const { tenant } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const { conexao } = await conexaoDoTenant(serviceSupabase(), tenant.id)
  try {
    const modelos = await cloudApi().listarModelos(conexao)
    return modelos.map(({ nomeado: _, ...m }) => m)
  } catch (e) {
    erroDoEnvio(e, tenant.slug)
  }
})
