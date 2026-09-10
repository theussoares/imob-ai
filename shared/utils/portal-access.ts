import type { ContractPartyRole, PortalDocCategory } from '~~/shared/models/portal'

/**
 * A regra de "este cliente pode ver este documento?", em código.
 *
 * A mesma regra existe como policy de RLS na migration 0028. A duplicação é
 * deliberada e não é redundante: o download é assinado pelo servidor com a
 * service role — que IGNORA RLS, porque o cliente não tem policy de leitura no
 * bucket privado. Nesse caminho, esta função é a única barreira entre o
 * inquilino e o extrato de repasse do proprietário.
 *
 * Por isso ela é pura e testada: é o pedaço do sistema onde um `||` no lugar de
 * um `&&` vaza documento assinado.
 */

export interface DocumentVisibility {
  audience: readonly ContractPartyRole[]
  /** Nulo = rascunho. Ainda não é do cliente. */
  publishedAt: string | null
}

/**
 * `roles` são os papéis que a pessoa tem NAQUELE contrato — vazio significa que
 * ela não é parte, e nesse caso nada é visível.
 */
export function canClientSeeDocument(
  doc: DocumentVisibility,
  roles: readonly ContractPartyRole[],
): boolean {
  if (!doc.publishedAt) return false
  if (!roles.length) return false
  return roles.some((role) => doc.audience.includes(role))
}

/** Filtra uma lista já carregada, aplicando a mesma regra item a item. */
export function visibleDocumentsFor<T extends DocumentVisibility>(
  docs: readonly T[],
  roles: readonly ContractPartyRole[],
): T[] {
  return docs.filter((d) => canClientSeeDocument(d, roles))
}

/**
 * Para quem cada tipo de documento é, por padrão.
 *
 * Existe para que o público NUNCA dependa de alguém marcar a caixinha certa no
 * painel às 18h de uma sexta. Os dois casos que importam:
 *   - boleto é assunto do inquilino (quem paga o aluguel);
 *   - extrato de repasse é assunto do proprietário (quem recebe).
 * Trocar um pelo outro mostra a um cliente quanto o outro paga ou recebe.
 *
 * A imobiliária pode ampliar caso a caso no cadastro; o default é o lado seguro.
 */
export function defaultAudienceFor(category: PortalDocCategory): ContractPartyRole[] {
  switch (category) {
    case 'boleto':
    case 'recibo':
      return ['inquilino']
    case 'extrato':
      return ['proprietario']
    // Contrato e vistoria são o documento que as duas pontas assinaram — e é
    // exatamente o que o print do concorrente destaca.
    case 'contrato':
    case 'vistoria':
      return ['inquilino', 'proprietario', 'fiador']
    default:
      return ['inquilino', 'proprietario']
  }
}
