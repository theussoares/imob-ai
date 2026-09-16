import { CONTRACT_PARTY_ROLES, type ContractPartyRole } from '~~/shared/models/portal'
import {
  setDocumentAudience,
  setDocumentPublished,
} from '~~/server/repositories/portal-document.repository'

/** Publica, despublica, ou corrige o público-alvo. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })

  const body = await readBody<{ published?: unknown; audience?: unknown }>(event)

  if (Array.isArray(body?.audience)) {
    assertAudience(body.audience)
    return setDocumentAudience(client, tenant.id, id, body.audience as ContractPartyRole[])
  }

  if (typeof body?.published === 'boolean') {
    return setDocumentPublished(client, tenant.id, id, body.published)
  }

  throw createError({ statusCode: 422, statusMessage: 'Nada a alterar.' })
})
