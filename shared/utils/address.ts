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
