import { getPortalUser } from '~~/server/repositories/portal-user.repository'
import { convidarClientePortal } from '~~/server/repositories/portal-invite.repository'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { portalOrigin, urlDefinirSenha, urlLoginPortal } from '~~/server/utils/portal-origin'

/**
 * Dá acesso à Área do Cliente a quem foi cadastrado sem acesso — ou reenvia o
 * convite de quem já tem.
 *
 * A pessoa sai do banco pelo id (com o tenant da sessão), e o e-mail é o
 * DELA, não o do body: o convite leva token de sessão, e aceitar e-mail do
 * navegador aqui mandaria esse token para qualquer caixa. A regra de quando
 * gerar link de senha é a de `convidarClientePortal`, sem exceção nova.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const pessoa = await getPortalUser(client, tenant.id, id)
  if (!pessoa) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado.' })
  if (!pessoa.email) {
    throw createError({ statusCode: 422, statusMessage: 'Cadastre o e-mail do cliente antes de dar acesso.' })
  }

  const service = serviceSupabase()
  const origem = await portalOrigin(service, tenant)
  const resultado = await convidarClientePortal(
    service,
    tenant.id,
    { nome: tenant.name, endereco: await remetenteDoTenant(tenant), replyTo: tenant.email },
    { name: pessoa.name, email: pessoa.email, doc: pessoa.doc, phone: pessoa.phone },
    urlDefinirSenha(origem),
    urlLoginPortal(origem),
  )
  logWarn('portal.acesso_liberado', { tenant: tenant.slug, reenvio: resultado.jaEraCliente, enviado: resultado.emailEnviado })
  return resultado
})
