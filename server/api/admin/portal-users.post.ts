import type { PortalUserInput } from '~~/shared/models/portal'
import { convidarClientePortal } from '~~/server/repositories/portal-invite.repository'

/**
 * Cadastra um cliente do portal e dispara o convite. Reenvia quando já existe.
 *
 * O `redirectTo` usa a origem DESTA requisição, e não uma URL fixa: o painel
 * responde em `painel.<dominio>` e o portal no domínio público, então um link
 * montado com host fixo levaria o cliente ao lugar errado. O middleware de host
 * ainda redireciona `/area-cliente` do painel para o domínio público, mas o
 * link certo desde o começo evita um salto a mais no celular.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const body = await readBody<PortalUserInput>(event)
  assertPortalUserInput(body)

  const origin = getRequestURL(event).origin
  const resultado = await convidarClientePortal(
    serviceSupabase(),
    tenant.id,
    tenant.name,
    tenant.email,
    body,
    `${origin}/area-cliente/definir-senha`,
  )

  logWarn('portal.cliente_convidado', {
    tenant: tenant.slug,
    reenvio: resultado.jaEraCliente,
    enviado: resultado.emailEnviado,
  })

  return resultado
})
