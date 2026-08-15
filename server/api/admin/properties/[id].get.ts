import { getPropertyById } from '~~/server/repositories/property.repository'

/** Busca um único imóvel (painel) — evita trazer a lista inteira só pra achar um. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  const property = await getPropertyById(client, tenant.id, id)
  if (!property) throw createError({ statusCode: 404, statusMessage: 'Imóvel não encontrado.' })
  return property
})
