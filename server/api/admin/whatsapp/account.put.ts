import type { WhatsappAccountInput } from '~~/shared/models/whatsapp'
import { saveAccount } from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { ErroDoWhatsapp } from '~~/server/services/whatsapp/provider'

/**
 * Conecta o número da imobiliária (F0: à mão, até o Embedded Signup — spec,
 * "Fora do escopo").
 *
 * Só o owner, como a conta do Asaas: o token manda mensagem em nome da
 * imobiliária e gasta a conta da Meta dela.
 *
 * A ordem importa: cifra primeiro (sem a chave-mestra, 503 legível antes de
 * falar com a Meta), confere o token contra o número (token de outro número
 * falharia só na primeira resposta, com o cliente esperando), assina o app na
 * WABA e só então grava.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user, membership } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  if (membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Só o responsável pela conta da imobiliária pode conectar o WhatsApp.' })
  }
  const body = await readBody<WhatsappAccountInput>(event)
  assertWhatsappAccountInput(body)
  const conexao = { phoneNumberId: body.phoneNumberId.trim(), wabaId: body.wabaId.trim(), accessToken: body.accessToken.trim() }

  const cifrado = cifrar(conexao.accessToken)
  const meta = cloudApi()
  let numero
  try {
    numero = await meta.conferirNumero(conexao)
    await meta.assinarWebhook(conexao)
  } catch (e) {
    if (e instanceof ErroDoWhatsapp) {
      throw createError({
        statusCode: 422,
        statusMessage: e.credencialInvalida
          ? 'A Meta recusou o token. Gere um token do usuário do sistema com as permissões do WhatsApp e cole de novo.'
          : `A Meta não aceitou os dados: ${e.message}`,
      })
    }
    throw e
  }

  const r = await saveAccount(serviceSupabase(), tenant.id, {
    phoneNumberId: conexao.phoneNumberId,
    wabaId: conexao.wabaId,
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
})
