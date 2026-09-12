import { getPropertyById } from '~~/server/repositories/property.repository'

/**
 * Busca um único imóvel (painel) — evita trazer a lista inteira só pra achar um.
 *
 * Service role pelo mesmo motivo de `properties.get.ts`: a 0031 fechou as
 * colunas internas para `authenticated`, e o repositório usa `select('*')`.
 *
 * ⚠️ Sem RLS aqui. O filtro por `tenant.id` dentro de `getPropertyById` é o que
 * impede que um id de imóvel de outra imobiliária seja lido passando o id na
 * URL. `tenant` vem de `requireTenantMember`, nunca do request.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID inválido.' })
  const property = await getPropertyById(serviceSupabase(), tenant.id, id)
  if (!property) throw createError({ statusCode: 404, statusMessage: 'Imóvel não encontrado.' })
  return property
})
