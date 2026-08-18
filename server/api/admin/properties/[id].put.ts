import type { PropertyInput } from '~~/shared/models/property'
import { updateProperty } from '~~/server/repositories/property.repository'

/** Atualiza um imóvel. */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  // `expectedUpdatedAt` viaja no body mas NÃO faz parte do PropertyInput: é a
  // versão que a tela carregou, usada só como condição do update. Fica fora do
  // tipo de propósito, para nunca ser confundido com campo gravável.
  const body = await readBody<PropertyInput & { expectedUpdatedAt?: string | null }>(event)
  assertPropertyInput(body)
  const property = await updateProperty(client, tenant.id, id, body, body.expectedUpdatedAt, user.id)
  await invalidateTenantCache(tenant.id)
  return property
})
