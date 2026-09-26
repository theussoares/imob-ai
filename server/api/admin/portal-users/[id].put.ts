import { updateClientRecord } from '~~/server/repositories/portal-user.repository'

/** Corrige o cadastro de um cliente (nome, telefone, CPF/CNPJ e, sem acesso, e-mail). */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ name?: string; phone?: string | null; doc?: string | null; email?: string | null }>(event)
  assertPortalUserInput({ name: body?.name ?? 'x', email: body?.email, phone: body?.phone, doc: body?.doc })
  return updateClientRecord(client, tenant.id, id, body)
})
