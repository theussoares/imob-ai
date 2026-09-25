/**
 * Campos opcionais de propósito: a mesma função lida com o `Tenant` carregado
 * (campos sempre presentes) e com o formulário do painel (`TenantSettingsInput`,
 * campos opcionais) sem precisar de dois tipos ou de conversão no chamador.
 */
interface AddressFields {
  addressStreet?: string | null
  addressNumber?: string | null
  addressComplement?: string | null
  addressNeighborhood?: string | null
  city?: string | null
  state?: string | null
  addressZip?: string | null
}

interface Coordinates {
  latitude?: number | null
  longitude?: number | null
}

/** Tem endereço suficiente para mostrar algo no site (pelo menos rua)? */
export function hasStructuredAddress(t: Pick<AddressFields, 'addressStreet'>): boolean {
  return !!t.addressStreet?.trim()
}

function cep(v: string | null | undefined): string {
  const digits = (v || '').replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : v || ''
}

/** Endereço numa linha, só com o que estiver preenchido: "Rua X, 123 - Bairro, Cidade/UF - 00000-000". */
export function formatTenantAddress(t: AddressFields): string {
  const linha1 = [t.addressStreet, t.addressNumber].filter(Boolean).join(', ')
  const complemento = t.addressComplement?.trim()
  const parte1 = [linha1, complemento].filter(Boolean).join(' - ')

  const cidadeUf = [t.city, t.state].filter(Boolean).join('/')
  const parte2 = [t.addressNeighborhood, cidadeUf].filter(Boolean).join(', ')

  const zip = cep(t.addressZip)

  return [parte1, parte2, zip].filter(Boolean).join(' - ')
}

/**
 * O ponto cai no território brasileiro? Caixa retangular com ~1° de folga
 * sobre os extremos (Caburaí ao norte, Chuí ao sul, Ponta do Seixas a leste,
 * nascente do Moa a oeste) — não é fronteira, é o filtro do sinal de menos
 * esquecido, que é o erro real: ver `assertTenantSettingsInput`.
 */
export function dentroDoBrasil(lat: number, lng: number): boolean {
  return lat >= -35 && lat <= 6.5 && lng >= -75 && lng <= -28
}

/** Coordenadas do tenant, ou `null` quando ele não marcou um ponto no mapa. */
export function tenantCoordinates(t: Coordinates): { lat: number; lng: number } | null {
  if (typeof t.latitude !== 'number' || typeof t.longitude !== 'number') return null
  return { lat: t.latitude, lng: t.longitude }
}

/**
 * `src` de um `<iframe>` do Google Maps sem chave de API — usa o endpoint de
 * embed clássico (`output=embed`), que aceita coordenadas ou uma busca por
 * texto. Existe porque um mapa incorporado com API key exigiria a
 * imobiliária (ou nós) terem conta de faturamento no Google Cloud só para
 * mostrar um pino — custo e complexidade fora de proporção para o que a tela
 * precisa.
 */
export function googleMapsEmbedSrc(t: AddressFields & Coordinates): string | null {
  const coords = tenantCoordinates(t)
  if (coords) return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=16&output=embed`
  const endereco = formatTenantAddress(t)
  return endereco ? `https://maps.google.com/maps?q=${encodeURIComponent(endereco)}&z=15&output=embed` : null
}

/** Link para abrir o endereço no Google Maps (app ou navegador), fora do iframe. */
export function googleMapsLink(t: AddressFields & Coordinates): string | null {
  const coords = tenantCoordinates(t)
  if (coords) return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
  const endereco = formatTenantAddress(t)
  return endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : null
}

/**
 * Mapa do BAIRRO de um imóvel, nunca do endereço.
 *
 * Localização é o que o comprador mais quer saber e a página do imóvel não
 * mostrava nada além do nome do bairro. Mas o ponto exato é coluna interna
 * (`properties.location`, ver o guardrail de payload público): a imobiliária
 * não quer o endereço exposto antes do contato — é o que impede quem vê o
 * anúncio de ir direto ao proprietário.
 *
 * Por isso a busca é por texto, "Bairro, Cidade - UF", só com campos que já são
 * públicos. Sem bairro não há mapa: a cidade inteira não ajuda a decidir nada.
 */
type BairroDoImovel = {
  neighborhood: string | null
  city: string | null
  state?: string | null
}

function buscaDoBairro(p: BairroDoImovel): string | null {
  const bairro = p.neighborhood?.trim()
  if (!bairro) return null
  const cidadeUf = [p.city, p.state].filter(Boolean).join(' - ')
  return [bairro, cidadeUf].filter(Boolean).join(', ')
}

export function neighborhoodMapsEmbedSrc(p: BairroDoImovel): string | null {
  const q = buscaDoBairro(p)
  return q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed` : null
}

/**
 * Mesmo bairro, aberto fora do iframe. No celular abre o app de mapas — onde a
 * pessoa quer calcular o trajeto até o trabalho, coisa que o iframe não faz —
 * e é a saída quando o iframe não carrega (rede corporativa ou extensão que
 * bloqueia google.com deixam o quadro cinza, sem erro visível na página).
 */
export function neighborhoodMapsLink(p: BairroDoImovel): string | null {
  const q = buscaDoBairro(p)
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}
