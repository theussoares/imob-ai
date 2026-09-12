import type { ContractPartyRole, PortalDocCategory } from '~~/shared/models/portal'

/**
 * A regra de "este cliente pode ver este documento?", em código.
 *
 * A mesma regra existe como policy de RLS (migration 0028, corrigida pela 0033).
 * A duplicação é deliberada: são as DUAS barreiras do card 2.3, e cada uma cobre
 * a falha da outra.
 *
 *   1. esta função, em TypeScript, no caminho do download;
 *   2. a policy de `storage.objects`, em SQL, que roda porque o download usa o
 *      token do próprio cliente — nunca service role.
 *
 * Quando esta função foi escrita (card 0.3), o desenho previa assinar com
 * service role, que ignora RLS: ela era a ÚNICA barreira. O spike de 11/09 mudou
 * isso. Ela continua pura e testada pelo mesmo motivo de antes — é o pedaço do
 * sistema onde um `||` no lugar de um `&&` entrega o extrato do proprietário ao
 * inquilino —, mas agora com uma rede embaixo.
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
