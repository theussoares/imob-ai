import { listAllProperties } from '~~/server/repositories/property.repository'

/**
 * Lista todos os imóveis do tenant (qualquer status) para o painel.
 *
 * Lê por SERVICE ROLE, e não pelo client do usuário, porque a 0031 fechou as
 * colunas internas (`owner_name`, `owner_phone`, `location`, `broker_id`,
 * `updated_by`) para o papel `authenticated` — que é o mesmo papel do cliente do
 * portal. Pelo client do usuário, esta query falharia com "permission denied for
 * table properties": o PostgREST expande o `select('*')` do repositório para
 * todas as colunas.
 *
 * ⚠️ Service role IGNORA RLS. O `tenant.id` vem de `requireTenantMember`, nunca
 * do request, e o filtro por tenant dentro do repositório é a ÚNICA barreira
 * entre os clientes — é o mesmo contrato já documentado em
 * `member.repository.ts`. O teste `admin-properties-tenant-scope` existe para
 * garantir que esse filtro não desapareça num refactor.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  return listAllProperties(serviceSupabase(), tenant.id)
})
