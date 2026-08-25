/**
 * Prefixos de topo que NÃO são a URL de detalhe de um imóvel, mesmo tendo dois
 * segmentos (ex.: `/api/properties`, `/feed/imoveis.xml`). Toda rota nova de
 * topo — API, painel, categoria, o que for — precisa entrar aqui, senão
 * `isPropertyPath` a reivindica como imóvel em silêncio.
 */
const RESERVED_PREFIXES = ['/imoveis/', '/admin', '/api', '/feed', '/.well-known']

/**
 * Um caminho de dois segmentos que não é rota reservada (ver
 * `RESERVED_PREFIXES`) é a URL de detalhe de um imóvel: `/{slug}/{codigo}`. A
 * checagem final (o código existe mesmo?) é feita por quem chama, consultando
 * a lista de imóveis do tenant.
 *
 * Separada do middleware porque `defineEventHandler` roda no import e não
 * existe fora do runtime do Nuxt: junto, o teste explodiria antes da primeira
 * asserção.
 */
export function isPropertyPath(path: string): boolean {
  return /^\/[^/]+\/[^/]+$/.test(path) && !RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix))
}
