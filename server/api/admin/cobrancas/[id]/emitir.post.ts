/** Emite o boleto + Pix no provedor da imobiliária. Regras em `emitirCobranca`. */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  await exigirCobranca(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  return emitirCobranca(client, tenant, id)
})
