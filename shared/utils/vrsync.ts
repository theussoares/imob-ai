import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_REGISTRY, temQuartos } from '~~/shared/models/property'
import { onlyDigits } from '~~/shared/utils/phone'

/**
 * O que o Canal Pro (Grupo OLX: ZAP, Viva Real, OLX) exige de um anúncio VRSync
 * para aceitá-lo, escrito como a imobiliária entende.
 *
 * Existe porque o feed já esteve "no ar" sem funcionar: ele nunca mandou CEP
 * nem rua, e o Canal Pro recusava TODOS os anúncios. O painel dizia
 * "integração ativa", o cliente colava o link, e o erro só aparecia no
 * relatório de carga do portal — que o cliente não sabe ler e nós não vemos.
 * Agora a regra mora aqui, e as duas pontas leem dela: o feed deixa de fora o
 * anúncio que seria recusado, e o painel diz qual imóvel ficou de fora e por quê.
 *
 * Só entram exigências documentadas pelo Grupo OLX. Regra inventada aqui
 * esconderia do portal imóvel que ele aceitaria.
 */

/** Mínimo do VRSync para `Description`. Abaixo disso o anúncio é recusado. */
export const VRSYNC_DESCRICAO_MIN = 50
/** Máximo do VRSync para `Description`. Acima disso o feed corta. */
export const VRSYNC_DESCRICAO_MAX = 3000
/** Máximo do VRSync para `Title`. Acima disso o feed corta. */
export const VRSYNC_TITULO_MAX = 100

/** Pendências que impedem o anúncio de subir. Lista vazia = pronto. */
export function pendenciasVrsync(p: Property): string[] {
  const out: string[] = []
  if (onlyDigits(p.addressZip).length !== 8) out.push('Falta o CEP')
  if (!p.addressStreet?.trim()) out.push('Falta a rua')
  if (!p.neighborhood?.trim()) out.push('Falta o bairro')
  if (!p.city?.trim()) out.push('Falta a cidade')
  if (!p.state?.trim()) out.push('Falta o estado (UF)')
  if (!(p.price > 0)) out.push('Falta o preço')
  // LivingArea (construído) ou LotArea (terreno): um dos dois é obrigatório,
  // conforme o tipo — e os dois saem do mesmo campo de área.
  if (!(p.area > 0)) out.push('Falta a área')
  const descricao = (p.description ?? '').trim().length
  if (descricao < VRSYNC_DESCRICAO_MIN) {
    out.push(
      descricao
        ? `Descrição curta demais (${descricao} de ${VRSYNC_DESCRICAO_MIN} caracteres)`
        : 'Falta a descrição',
    )
  }
  if (!p.images.length) out.push('Falta ao menos uma foto')
  return out
}

/** `Residential` ou `Commercial`, o prefixo que o próprio `vrsync` do tipo já carrega. */
export function usageTypeVrsync(p: Pick<Property, 'type'>): 'Residential' | 'Commercial' {
  return PROPERTY_TYPE_REGISTRY[p.type].vrsync.startsWith('Commercial') ? 'Commercial' : 'Residential'
}

/** O tipo não tem quartos (terreno, galpão…): manda LotArea e omite cômodos. */
export function ehSemComodos(p: Pick<Property, 'type'>): boolean {
  return !temQuartos(p.type)
}
