import type { PortalUserInput } from '~~/shared/models/portal'
import { convidarClientePortal } from '~~/server/repositories/portal-invite.repository'
import { createClientRecord } from '~~/server/repositories/portal-user.repository'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { portalOrigin, urlDefinirSenha, urlLoginPortal } from '~~/server/utils/portal-origin'

/**
 * Cadastra um cliente e, se pedido, dispara o convite da Área do Cliente.
 *
 * Cadastro NOVO com e-mail que já é de um cliente desta imobiliária é recusado.
 * Antes virava reenvio calado: a tela dizia "Convite enviado para <nome
 * digitado>", descartava o nome, o WhatsApp e o CPF digitados e mandava um link
 * de redefinição ao cadastro antigo (teste de 27/09, BUG-UI-07). Reenviar é o
 * botão da linha do cliente (`portal-users/[id]/acesso`).
 *
 * O destino do link sai do BANCO (`portalOrigin`), não de
 * `getRequestURL(event).origin`: aquele valor vem de `Host`/`X-Forwarded-Host`,
 * que é dado do cliente, e o link carrega um token de sessão. Ver a nota em
 * `server/utils/portal-origin.ts`.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const body = await readBody<PortalUserInput>(event)
  assertPortalUserInput(body)

  // Cadastrar não é mais convidar (0050). Sem `convidar`, a pessoa existe só
  // para a imobiliária — e nada de conta no Auth, nada de e-mail.
  if (!body.convidar) {
    return { cliente: await createClientRecord(client, tenant.id, body), convidado: false }
  }

  const email = body.email?.trim().toLowerCase()
  if (email) {
    const { data: jaCliente } = await client
      .from('portal_users')
      .select('name')
      .eq('tenant_id', tenant.id)
      .eq('email', email)
      .maybeSingle()
    if (jaCliente) {
      throw createError({
        statusCode: 409,
        statusMessage: `Este e-mail já é do cliente ${jaCliente.name}. Para reenviar o acesso, use o botão na linha dele.`,
      })
    }
  }

  const service = serviceSupabase()
  const origem = await portalOrigin(service, tenant)

  const remetente = {
    nome: tenant.name,
    endereco: await remetenteDoTenant(tenant),
    replyTo: tenant.email,
  }

  const resultado = await convidarClientePortal(
    service,
    tenant.id,
    remetente,
    body,
    urlDefinirSenha(origem),
    urlLoginPortal(origem),
  )

  logWarn('portal.cliente_convidado', {
    tenant: tenant.slug,
    reenvio: resultado.jaEraCliente,
    semToken: resultado.semToken,
    enviado: resultado.emailEnviado,
  })

  return { ...resultado, convidado: true }
})
