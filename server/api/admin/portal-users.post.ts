import type { PortalUserInput } from '~~/shared/models/portal'
import { convidarClientePortal } from '~~/server/repositories/portal-invite.repository'
import { createClientRecord } from '~~/server/repositories/portal-user.repository'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { portalOrigin, urlDefinirSenha, urlLoginPortal } from '~~/server/utils/portal-origin'

/**
 * Cadastra um cliente e, se pedido, dispara o convite da Área do Cliente.
 * Reenvia quando já existe.
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
