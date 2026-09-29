import { MODELO_IDIOMA, MODELOS_SUGERIDOS } from '~~/shared/models/whatsapp'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { conexaoDoTenant, erroDoEnvio } from '~~/server/utils/whatsapp-envio'

/**
 * Pede à Meta a análise dos dois modelos sugeridos (`MODELOS_SUGERIDOS`).
 * A aprovação sai em minutos ou horas; até lá eles aparecem como "em análise".
 *
 * Só o owner: o modelo fica na conta da Meta DELA, com o nome dela na
 * mensagem, e a categoria decide quanto cada envio custa.
 */
export default defineEventHandler(async (event) => {
  const { tenant, membership } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode criar modelos.' })
  }
  const { conexao } = await conexaoDoTenant(serviceSupabase(), tenant.id)
  const meta = cloudApi()
  const resultado: Record<string, 'criado' | 'ja_existe'> = {}
  try {
    for (const m of MODELOS_SUGERIDOS) {
      resultado[m.name] = await meta.criarModelo(conexao, {
        name: m.name,
        language: MODELO_IDIOMA,
        category: m.category,
        body: m.body,
        exemplo: m.exemplo,
      })
    }
  } catch (e) {
    erroDoEnvio(e, tenant.slug)
  }
  return resultado
})
