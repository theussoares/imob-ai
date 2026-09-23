import type { PropertyInput } from '~~/shared/models/property'
import { canonicalNeighborhood } from '~~/shared/utils/neighborhood'
import { createProperty, listNeighborhoods } from '~~/server/repositories/property.repository'

/**
 * Cria um imóvel.
 *
 * Service role porque `createProperty` termina lendo o imóvel completo de volta
 * (`select('*')` + `getPropertyById`), para devolver o modelo com os campos
 * internos que a tela acabou de gravar. Pelo client do usuário isso falharia
 * desde a 0031, que fechou essas colunas para `authenticated`.
 *
 * ⚠️ Sem RLS. O `tenant.id` do `requireTenantMember` é gravado na linha e usado
 * em todo filtro subsequente — é o que mantém o imóvel dentro da imobiliária
 * certa. Nunca aceitar tenant do body.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantMember(event)
  const body = await readBody<PropertyInput>(event)
  assertPropertyInput(body)

  // Alinha o bairro à grafia que a imobiliária já usa. Sem isto, "Bela vista
  // da lagoa " entra como bairro novo e fragmenta a página do bairro — em
  // produção uma imobiliária tinha SEIS grafias do mesmo lugar. A lista sai
  // escopada pelo tenant, como todo o resto.
  body.neighborhood = canonicalNeighborhood(
    body.neighborhood,
    await listNeighborhoods(serviceSupabase(), tenant.id),
  )

  const property = await createProperty(serviceSupabase(), tenant.id, body, user.id)
  await invalidateTenantCache(tenant.id)
  return property
})
