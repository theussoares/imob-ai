import { slugify } from './property-url'

/**
 * Hub local: /imobiliaria-<cidade>, a página que responde "imobiliária em
 * <cidade>" (plano de SEO local, 08/10).
 *
 * A URL sai de `tenant.city`, nunca de um texto fixo: a plataforma serve várias
 * imobiliárias, e a de outra cidade ganha o próprio hub sem mexer em código.
 *
 * `city` é texto livre digitado no cadastro, então o segmento vem de `slugify`
 * (o mesmo normalizador da URL do imóvel): "Três Lagoas", "Tres Lagoas " e "TRÊS
 * LAGOAS" dão o mesmo `tres-lagoas`. Sem cidade não há hub — e a rota responde
 * 404 em vez de publicar uma página "Imobiliária em " sem lugar nenhum.
 */

export const HUB_PREFIXO = 'imobiliaria-'

/** Segmento da cidade, ou `null` quando o tenant não tem cidade utilizável. */
export function hubCidadeSlug(city: string | null | undefined): string | null {
  const slug = slugify(city || '')
  return slug || null
}

/** Caminho do hub, ou `null` quando o tenant não tem cidade. */
export function hubPath(city: string | null | undefined): string | null {
  const slug = hubCidadeSlug(city)
  return slug ? `/${HUB_PREFIXO}${slug}` : null
}

/**
 * O parâmetro da rota é o hub deste tenant?
 *
 * Só a cidade DELE vale: `/imobiliaria-qualquer-coisa` não pode responder 200
 * com a mesma página, senão cada URL inventada vira conteúdo duplicado indexável.
 */
export function hubCorresponde(city: string | null | undefined, parametro: string): boolean {
  const slug = hubCidadeSlug(city)
  return !!slug && slug === parametro
}

/**
 * A marca, sem o complemento de SEO que muita imobiliária já põe no nome: o da
 * OLMI é "OLMI Imóveis | Imobiliária em Três Lagoas", e na frase "a <nome> é uma
 * imobiliária em Três Lagoas" o lugar saía duas vezes. Só o trecho antes do
 * primeiro " | " — sem barra, o nome fica como está.
 */
export function hubMarca(name: string): string {
  const [marca] = name.split(/\s+\|\s+/)
  return marca?.trim() || name.trim()
}

/** "Três Lagoas - MS", ou só a cidade quando não há UF. */
export function hubLugar(city: string, state: string | null | undefined): string {
  const uf = (state || '').trim()
  return uf ? `${city.trim()} - ${uf}` : city.trim()
}

/** H1 e título (o `titleTemplate` do app acrescenta "· <imobiliária>"). */
export function hubTitulo(city: string, state: string | null | undefined): string {
  return `Imobiliária em ${hubLugar(city, state)}`
}

/**
 * Descrição da página. Só afirma o que o cadastro sabe: o nome, o lugar e a
 * quantidade REAL de imóveis. "Casas, apartamentos e terrenos" seria promessa
 * de uma imobiliária que talvez só trabalhe com aluguel.
 */
export function hubDescricao(opts: { name: string; city: string; state?: string | null; imoveis: number }): string {
  const lugar = hubLugar(opts.city, opts.state)
  const base = `Imóveis para comprar ou alugar em ${lugar} com a ${hubMarca(opts.name)}`
  if (opts.imoveis <= 0) return `${base}. Fale com a equipe e encontre o imóvel certo.`
  const n = opts.imoveis === 1 ? '1 imóvel disponível' : `${opts.imoveis} imóveis disponíveis`
  return `${base}: ${n}, com fotos, valores e atendimento direto pelo WhatsApp.`
}
