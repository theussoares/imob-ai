import { listActiveProperties } from '~~/server/repositories/property.repository'
import { renderOgCard } from '~~/server/utils/og-render'
import { homeOgImage } from '~~/shared/utils/og-image'

/**
 * Card social da home — e de toda página que não tem imagem própria
 * (categorias, bairros, "quero vender"), que apontam para cá pelo app.vue.
 *
 * É rota (e não arquivo estático) pelo mesmo motivo do favicon.svg e do
 * sitemap.xml: o conteúdo varia por host. Aqui ela também converte: a foto vive
 * no Storage em WebP, que o WhatsApp não mostra em preview de link.
 *
 * O `?v=` que o app.vue anexa não é lido aqui. Ele só muda a URL quando a foto
 * de origem muda, para furar o cache que o WhatsApp mantém por URL — quem decide
 * qual foto usar é este handler, sempre a partir do banco.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'image/jpeg')
  // `immutable` é seguro porque a URL carrega `?v=<hash da foto>`: trocar a foto
  // no painel gera outra URL, em vez de depender de expiração.
  setHeader(event, 'cache-control', 'public, max-age=86400, s-maxage=31536000, immutable')

  const tenant = event.context.tenant
  // Domínio-raiz da plataforma (landing da Moradi) ou host desconhecido: não há
  // tenant, então sai o card na cor da plataforma.
  if (!tenant) return renderOgCard(null, 'photo', null)

  // Hero e logo bastam para decidir na maioria dos tenants; a lista só é buscada
  // quando não há hero — e aí reaproveita o mesmo cache que o sitemap, o
  // llms.txt e o feed já preenchem, em vez de abrir consulta própria.
  //
  // `listActiveProperties` (e não `listActivePropertyCards`): a consulta dos
  // cards seleciona `broker_id`, que a 0031 revogou para `anon` — com ela, esta
  // rota tomaria "permission denied" e todo tenant sem hero cairia no card da
  // logo sem ninguém perceber.
  let lista: { images?: { url: string }[] }[] = []
  if (!tenant.heroImage?.trim()) {
    lista = await cached(tenantCacheKey(tenant.id, 'properties:active'), () =>
      listActiveProperties(publicSupabase(), tenant.id),
    ).catch((e) => {
      logWarn('og.home.lista_falhou', { tenant: tenant.slug, reason: errMessage(e) })
      return []
    })
  }

  const source = homeOgImage(tenant, lista)
  // A logo precisa caber inteira sobre a cor da marca; foto preenche e corta.
  const kind = source && source === tenant.logoUrl?.trim() ? 'logo' : 'photo'

  return renderOgCard(source, kind, tenant.brandPrimary)
})
