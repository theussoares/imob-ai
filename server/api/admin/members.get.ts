import { listMembers } from '~~/server/repositories/member.repository'

/** Quem tem acesso ao painel desta imobiliária. */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  // Service role: o e-mail vive no schema `auth`, fora do alcance da chave
  // pública. O isolamento entre clientes passa a ser a query, não a RLS — por
  // isso o tenant vem do contexto autenticado e nunca do request.
  return listMembers(serviceSupabase(), tenant.id)
})
