import type { PropertyInput } from '~~/shared/models/property'
import { canonicalNeighborhood } from '~~/shared/utils/neighborhood'
import { updateProperty, listNeighborhoods } from '~~/server/repositories/property.repository'

/**
 * Atualiza um imóvel.
 *
 * Service role porque `updateProperty` termina em `getPropertyById`, que lê o
 * imóvel completo — com as colunas internas que a 0031 fechou para
 * `authenticated`.
 *
 * ⚠️ Sem RLS. Os dois filtros dentro de `updateProperty` (`tenant_id` e `id`)
 * são a única barreira: sem o de tenant, um id descoberto permitiria editar
 * imóvel de outra imobiliária. `tenant` vem de `requireTenantMember`.
 *
 * A trava de concorrência (`expectedUpdatedAt`) não muda de comportamento —
 * `updated_at` está entre as colunas públicas.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))
  // `expectedUpdatedAt` viaja no body mas NÃO faz parte do PropertyInput: é a
  // versão que a tela carregou, usada só como condição do update. Fica fora do
  // tipo de propósito, para nunca ser confundido com campo gravável.
  const body = await readBody<PropertyInput & { expectedUpdatedAt?: string | null }>(event)
  assertPropertyInput(body)

  // Alinha o bairro à grafia que a imobiliária já usa. Sem isto, "Bela vista
  // da lagoa " entra como bairro novo e fragmenta a página do bairro — em
  // produção uma imobiliária tinha SEIS grafias do mesmo lugar. A lista sai
  // escopada pelo tenant, como todo o resto.
  body.neighborhood = canonicalNeighborhood(
    body.neighborhood,
    await listNeighborhoods(serviceSupabase(), tenant.id),
  )

  const property = await updateProperty(
    serviceSupabase(),
    tenant.id,
    id,
    body,
    body.expectedUpdatedAt,
    user.id,
  )
  await invalidateTenantCache(tenant.id)
  return property
})
