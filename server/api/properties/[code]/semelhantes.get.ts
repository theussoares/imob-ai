import { listActivePropertyCards } from '~~/server/repositories/property.repository'
import { enxugarCards } from '~~/shared/utils/card-photos'
import { similaresPorCodigo } from '~~/shared/utils/similar-properties'

/**
 * Até 4 imóveis parecidos com o do código, para o fim da página de detalhe.
 *
 * Existe para a página não precisar do catálogo inteiro. Antes, ela baixava
 * `/api/properties` no navegador e escolhia os semelhantes lá: a requisição
 * aparecia em toda visita que chegava direto (Google, link de WhatsApp), e
 * trazer o catálogo no HTML do SSR teria sido pior, porque é a página mais
 * aberta no celular. Aqui o servidor escolhe e devolve só os cards que vão
 * aparecer.
 *
 * Mesmo cache do catálogo (`properties:cards`): não é outra consulta ao banco,
 * e a invalidação que já existe para os cards vale para isto também.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const code = getRouterParam(event, 'code') || ''

  const catalogo = await cached(tenantCacheKey(tenant.id, 'properties:cards'), () =>
    listActivePropertyCards(serviceSupabase(), tenant.id),
  )
  return enxugarCards(similaresPorCodigo(code, catalogo))
})
