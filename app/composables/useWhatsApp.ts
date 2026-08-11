import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

/** Gera links de WhatsApp e telefone a partir do tenant atual. */
export function useContact() {
  const tenant = useTenant()

  function whatsappLink(property?: Property | null): string {
    const wa = onlyDigits(tenant.value?.whatsapp)
    let msg: string
    if (property) {
      const price = formatBRL(property.price) + (property.purpose === 'aluguel' ? '/mês' : '')
      const local = property.neighborhood ? ` no ${property.neighborhood}` : ''
      msg = `Olá! Tenho interesse no imóvel ${property.code} — ${PROPERTY_TYPE_LABELS[property.type]}${local} (${property.purpose === 'aluguel' ? 'aluguel' : 'venda'} · ${price}). Ainda está disponível?`
    } else {
      msg = 'Olá! Vi o site e gostaria de mais informações sobre os imóveis.'
    }
    return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`
  }

  function telLink(): string {
    return `tel:${tenant.value?.phone || ''}`
  }

  return { whatsappLink, telLink }
}
