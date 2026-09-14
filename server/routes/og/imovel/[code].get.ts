import { getPropertyByCode } from '~~/server/repositories/property.repository'
import { renderOgCard } from '~~/server/utils/og-render'
import { homeOgImage } from '~~/shared/utils/og-image'

/**
 * Card social de um imóvel: a capa, em JPEG 1200×630.
 *
 * A rota atendida é `/og/imovel/VD-0019.jpg` — o `.jpg` chega dentro do
 * parâmetro e é removido aqui. A extensão existe porque vários leitores de
 * preview (o do WhatsApp inclusive) desconfiam de og:image sem extensão de
 * imagem, mesmo com o content-type correto.
 *
 * Imóvel sem foto cai no card da marca em vez de não anunciar imagem nenhuma:
 * card na cor da imobiliária ainda ocupa o espaço do preview e parece
 * intencional; preview sem imagem parece link quebrado.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'image/jpeg')
  setHeader(event, 'cache-control', 'public, max-age=86400, s-maxage=31536000, immutable')

  const tenant = event.context.tenant
  if (!tenant) return renderOgCard(null, 'photo', null)

  const code = decodeURIComponent(getRouterParam(event, 'code') || '').replace(/\.jpe?g$/i, '')

  const property = code
    ? await getPropertyByCode(publicSupabase(), tenant.id, code).catch((e) => {
        logWarn('og.imovel.lookup_failed', { tenant: tenant.slug, code, reason: errMessage(e) })
        return null
      })
    : null

  // Imóvel inexistente (ou já vendido, que sai do catálogo): card da marca, e
  // não 404. Link antigo circulando no WhatsApp continua com preview decente.
  const source = property?.images[0]?.url || homeOgImage(tenant, [])
  const kind = source && source === tenant.logoUrl?.trim() ? 'logo' : 'photo'

  return renderOgCard(source, kind, tenant.brandPrimary)
})
