/** Cancela no provedor e depois aqui, nessa ordem (ver `cancelarCobranca`). */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = (await readBody<{ reason?: string | null }>(event)) ?? {}
  const motivo = body.reason == null ? null : String(body.reason)
  if (motivo) assertMaxLength(motivo, 300, 'Motivo')
  return cancelarCobranca(client, tenant, id, motivo, user.id)
})
