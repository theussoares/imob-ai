import type { Property, PropertyCard } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'
import { formatPropertyCode } from '~~/shared/utils/property-specs'

/** Gera links de WhatsApp e telefone a partir do tenant atual. */
export function useContact() {
  const tenant = useTenant()

  // Aceita o modelo completo (página de detalhe) ou o enxuto do card — a mensagem
  // usa só campos que os dois têm.
  function whatsappLink(property?: Property | PropertyCard | null): string {
    const prop = property as Property | undefined
    const brokerWa = onlyDigits(prop?.brokerPhone || prop?.broker?.phone || '')
    const wa = brokerWa || onlyDigits(tenant.value?.whatsapp)
    let msg: string
    if (property) {
      const price = formatBRL(property.price) + (property.purpose === 'aluguel' ? '/mês' : '')
      const local = property.neighborhood ? ` no ${property.neighborhood}` : ''
      // Código na forma normalizada, a MESMA que a pessoa acabou de ler no
      // card. Mandar a string crua faria ela conferir "V.D- 0010" contra o
      // "VD-0010" da tela e duvidar se é o mesmo imóvel. A chave que casa o
      // lead no banco continua sendo `property.code` cru, no LeadForm.
      msg = `Olá! Tenho interesse no imóvel ${formatPropertyCode(property.code)} — ${PROPERTY_TYPE_LABELS[property.type]}${local} (${property.purpose === 'aluguel' ? 'aluguel' : 'venda'} · ${price}). Ainda está disponível?`
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
