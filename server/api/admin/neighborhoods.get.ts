import { listNeighborhoods } from '~~/server/repositories/property.repository'

/**
 * Bairros já cadastrados na imobiliária, os mais usados primeiro.
 *
 * Alimenta a lista de sugestões do formulário de imóvel. Existe porque a
 * canonização do servidor só alcança o que se LÊ igual: "Jardim dos Ipês 2" e
 * "Jardim dos Ipes3" são bairros distintos para qualquer normalizador, e só
 * quem está digitando sabe que quis dizer "Jardim dos Ipês". Ver o porquê em
 * `canonicalNeighborhood`.
 *
 * ⚠️ Sem RLS: `requireTenantMember` dá o tenant, e ele é o único filtro entre
 * uma imobiliária e a lista de bairros da outra.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  return await listNeighborhoods(serviceSupabase(), tenant.id)
})
