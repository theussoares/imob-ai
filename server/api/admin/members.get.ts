import { listMembers } from '~~/server/repositories/member.repository'

/** Quem tem acesso ao painel desta imobiliária. */
export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantMember(event)
  // Service role: o e-mail vive no schema `auth`, fora do alcance da chave
  // pública. O isolamento entre clientes passa a ser a query, não a RLS — por
  // isso o tenant vem do contexto autenticado e nunca do request.
  // `voce` deixa a tela esconder o "Remover" que o servidor recusaria (a própria
  // linha e, para quem não é o owner, todas).
  const membros = await listMembers(serviceSupabase(), tenant.id)
  return membros.map((m) => ({ ...m, voce: m.userId === user.id }))
})
