/**
 * Um caminho de dois segmentos que não é rota reservada (categorias em
 * `/imoveis/` ou o painel em `/admin`) é a URL de detalhe de um imóvel:
 * `/{slug}/{codigo}`. A checagem final (o código existe mesmo?) é feita por
 * quem chama, consultando a lista de imóveis do tenant.
 *
 * Separada do middleware porque `defineEventHandler` roda no import e não
 * existe fora do runtime do Nuxt: junto, o teste explodiria antes da primeira
 * asserção.
 */
export function isPropertyPath(path: string): boolean {
  return /^\/[^/]+\/[^/]+$/.test(path) && !path.startsWith('/imoveis/') && !path.startsWith('/admin')
}
