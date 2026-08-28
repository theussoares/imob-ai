/**
 * Imagem de preview da home (og:image) — a que aparece ao colar o link no
 * WhatsApp.
 *
 * A home não tinha nenhuma, então compartilhá-la nunca mostrou imagem. A página
 * de detalhe já anuncia a capa do próprio imóvel e não passa por aqui.
 *
 * Ordem: logo da imobiliária primeiro, porque compartilhar a home é compartilhar
 * a marca; capa do primeiro imóvel como reserva, porque metade dos tenants não
 * tem logo cadastrada e um imóvel de verdade é melhor que nada.
 *
 * A lista chega ordenada por destaque (ver `listActivePropertyCards`), então o
 * "primeiro imóvel" é o em destaque quando existe um.
 */

/** Só o que este helper precisa do card — mantém a função testável sem o modelo inteiro. */
interface ComFotos {
  images?: { url: string }[]
}

export function homeOgImage(
  logoUrl: string | null | undefined,
  properties: ComFotos[],
): string | undefined {
  // O tenant `demo` guarda string vazia, não null — `|| null` não bastaria.
  const logo = (logoUrl || '').trim()
  if (logo) return logo

  // Imóvel sem foto cadastrada tem `images: []`; pular para o próximo é melhor
  // que desistir quando há foto logo abaixo. A capa é sempre `images[0]`
  // (ver `toPropertyCardModel`).
  return properties.find((p) => p.images?.[0]?.url)?.images?.[0]?.url
}
