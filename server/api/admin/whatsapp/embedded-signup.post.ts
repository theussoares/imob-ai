import { getAccountByPhoneNumberId, saveAccount } from '~~/server/repositories/whatsapp.repository'
import { cloudApi, trocarCodigo } from '~~/server/services/whatsapp/cloud-api'
import { ErroDoWhatsapp } from '~~/server/services/whatsapp/provider'
import { whatsappAppId, whatsappAppSecret } from '~~/server/utils/whatsapp-config'

/**
 * Fim do Embedded Signup: o popup da Meta devolveu um `code` (pelo callback do
 * FB.login) e os ids do número e da WABA (pela mensagem do popup).
 *
 * Os ids vêm do NAVEGADOR — a mensagem do popup passa por ele. Então nada
 * aqui confia neles: o token saído do `code` precisa enxergar a WABA, e o
 * número precisa estar NESSA WABA. Sem isso, um membro colaria o
 * `phone_number_id` de outro cliente da Meta e, com qualquer `code` válido
 * dele mesmo, tentaria prender aquele número à imobiliária dele. (O número de
 * OUTRA imobiliária daqui já é barrado por `saveAccount`.)
 *
 * Só o owner, como a conexão manual.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user, membership } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode conectar o WhatsApp.' })
  }
  const body = await readBody<{ code?: unknown; phoneNumberId?: unknown; wabaId?: unknown; coexistencia?: unknown; pin?: unknown }>(event)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const phoneNumberId = typeof body?.phoneNumberId === 'string' ? body.phoneNumberId.trim() : ''
  const wabaId = typeof body?.wabaId === 'string' ? body.wabaId.trim() : ''
  const coexistencia = body?.coexistencia === true
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''

  if (!code || code.length > 2000 || /\s/.test(code)) throw createError({ statusCode: 422, statusMessage: 'A Meta não devolveu a autorização. Tente de novo.' })
  if (!/^\d{5,30}$/.test(phoneNumberId) || !/^\d{5,30}$/.test(wabaId)) {
    throw createError({ statusCode: 422, statusMessage: 'O popup terminou sem escolher um número. Tente de novo e vá até o fim.' })
  }
  if (!coexistencia && !/^\d{6}$/.test(pin)) {
    throw createError({ statusCode: 422, statusMessage: 'Para um número novo, crie um PIN de 6 dígitos (é a verificação em duas etapas do WhatsApp).' })
  }

  const appId = whatsappAppId()
  const appSecret = whatsappAppSecret()
  if (!appId || !appSecret) {
    logError('whatsapp.embedded_signup_sem_app', { temAppId: Boolean(appId), temSecret: Boolean(appSecret) })
    throw createError({ statusCode: 503, statusMessage: 'A conexão pelo Facebook ainda não está habilitada nesta plataforma. Fale com o suporte.' })
  }

  const meta = cloudApi()
  try {
    // Primeiro, e já: o `code` vale segundos.
    const accessToken = await trocarCodigo({ appId, appSecret, code })
    const conexao = { phoneNumberId, wabaId, accessToken }
    const cifrado = cifrar(accessToken)

    const numeros = await meta.numerosDaWaba(conexao)
    if (!numeros.includes(phoneNumberId)) {
      logWarn('whatsapp.embedded_signup_numero_fora_da_waba', { tenant: tenant.slug })
      throw createError({ statusCode: 422, statusMessage: 'O número escolhido não pertence à conta autorizada. Tente de novo.' })
    }
    // Antes de registrar: registrar mexe no número NA META (troca o PIN), e
    // não há por que fazer isso com um número que já é de outra imobiliária
    // daqui — `saveAccount` recusaria depois, com o estrago feito.
    const jaConectado = await getAccountByPhoneNumberId(serviceSupabase(), phoneNumberId)
    if (jaConectado && jaConectado.tenantId !== tenant.id) {
      logWarn('whatsapp.numero_de_outro_tenant', { tenant: tenant.slug })
      throw createError({ statusCode: 409, statusMessage: 'Este número já está conectado em outra conta. Fale com o suporte.' })
    }
    if (!coexistencia) await meta.registrarNumero(conexao, pin)
    const numero = await meta.conferirNumero(conexao)
    await meta.assinarWebhook(conexao)

    const r = await saveAccount(serviceSupabase(), tenant.id, {
      phoneNumberId,
      wabaId,
      displayPhone: numero.displayPhone,
      verifiedName: numero.verifiedName,
      accessTokenEnc: cifrado,
      userId: user.id,
    })
    if (r === 'de_outro_tenant') {
      logWarn('whatsapp.numero_de_outro_tenant', { tenant: tenant.slug })
      throw createError({ statusCode: 409, statusMessage: 'Este número já está conectado em outra conta. Fale com o suporte.' })
    }
    return { ok: true, displayPhone: numero.displayPhone, verifiedName: numero.verifiedName }
  } catch (e) {
    if (e instanceof ErroDoWhatsapp) {
      logWarn('whatsapp.embedded_signup_recusado', { tenant: tenant.slug, credencial: e.credencialInvalida })
      throw createError({ statusCode: 422, statusMessage: `A Meta não concluiu a conexão: ${e.message}` })
    }
    throw e
  }
})
