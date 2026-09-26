import type { PortalUserInput } from '~~/shared/models/portal'
import { convidarClientePortal } from '~~/server/repositories/portal-invite.repository'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { portalOrigin, urlDefinirSenha, urlLoginPortal } from '~~/server/utils/portal-origin'

/**
 * Cadastra um cliente do portal e dispara o convite. Reenvia quando já existe.
 *
 * O destino do link sai do BANCO (`portalOrigin`), não de
 * `getRequestURL(event).origin`: aquele valor vem de `Host`/`X-Forwarded-Host`,
 * que é dado do cliente, e o link carrega um token de sessão. Ver a nota em
 * `server/utils/portal-origin.ts`.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const body = await readBody<PortalUserInput>(event)
  assertPortalUserInput(body)

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

  return resultado
})
