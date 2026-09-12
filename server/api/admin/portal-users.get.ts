import { listPortalUsers } from '~~/server/repositories/portal-user.repository'

/**
 * Clientes do portal desta imobiliária.
 *
 * Existe para o seletor de participantes do contrato (card 1.1). A tela de
 * cadastro de clientes é o card 1.2 — este endpoint só lê.
 *
 * ⚠️ A resposta inclui `doc` (CPF/CNPJ), que é dado do cadastro e não vai para
 * nenhuma tela de cliente. Aqui é o painel, atrás de `requireTenantMember`, e a
 * RLS de `portal_users` já restringe ao tenant; o filtro no repositório é a
 * segunda barreira.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listPortalUsers(client, tenant.id)
})
