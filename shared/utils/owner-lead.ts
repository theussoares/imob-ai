import type { PropertyPurpose, PropertyType } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'
import type { LeadType } from '~~/shared/models/lead'

export interface OwnerLeadInput {
  /** O que a pessoa quer fazer com o imóvel dela. */
  purpose: PropertyPurpose
  /** Tipo do imóvel oferecido. Vazio quando não informado. */
  propertyType: PropertyType | ''
  neighborhood: string
  note: string
}

/** Tipo de lead de quem OFERECE um imóvel com este objetivo. */
export function offeringTypeFor(purpose: PropertyPurpose): LeadType {
  return purpose === 'aluguel' ? 'oferta_aluguel' : 'oferta_venda'
}

/**
 * Monta a mensagem do lead de proprietário a partir dos campos do formulário.
 *
 * Os campos extras (tipo, bairro) viram texto em vez de colunas novas: são
 * informação para o corretor ler antes de ligar, não algo que alguém vá filtrar.
 * Coluna só o `lead_type`, que é o que muda o atendimento.
 *
 * O formato importa porque é isto que aparece no card do funil — separador solto
 * ou campo vazio no meio deixa a corretora sem entender do que se trata.
 */
export function buildOwnerLeadMessage(input: OwnerLeadInput): string {
  const partes = [
    input.purpose === 'aluguel' ? 'Quer alugar' : 'Quer vender',
    input.propertyType ? PROPERTY_TYPE_LABELS[input.propertyType] : '',
    input.neighborhood.trim(),
  ].filter(Boolean)

  const base = partes.join(' · ')
  const note = input.note.trim()
  return note ? `${base} — ${note}` : base
}
