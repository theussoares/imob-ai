import {
  CONTRACT_PARTY_LABELS,
  CONTRACT_PARTY_ROLES,
  type ContractPartyRole,
  type PortalDocCategory,
} from '~~/shared/models/portal'

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
    // O contrato de ADMINISTRAÇÃO é entre a imobiliária e o dono do imóvel — o
    // inquilino não é parte dele e não pode vê-lo. No contrato real que modelou
    // esta feature, o documento traz a taxa de administração (10%), a conta
    // bancária e a chave Pix pessoal do proprietário, e a comissão de venda
    // devida à imobiliária. É a margem comercial que a 0028 mandou chegar ao
    // proprietário pelo extrato, mais os dados bancários dele — tudo num PDF
    // que, sem esta linha, seria classificado como `contrato` e cairia na
    // audiência das duas pontas.
    case 'contrato_administracao':
      return ['proprietario']
    // Contrato de LOCAÇÃO e vistoria são o documento que as duas pontas
    // assinaram — e é exatamente o que o print do concorrente destaca.
    case 'contrato':
    case 'vistoria':
      return ['inquilino', 'proprietario', 'fiador']
    default:
      return ['inquilino', 'proprietario']
  }
}

/**
 * "Quem vai ver este documento?", em uma frase, para a tela de upload.
 *
 * Quem classifica o documento é a imobiliária, e a classificação decide quem
 * enxerga — então a consequência tem que estar visível no momento da escolha,
 * não escondida num default que só aparece depois de publicado.
 *
 * Deriva da audiência de verdade em vez de repetir o texto em outro lugar: se a
 * audiência de uma categoria mudar, a frase muda junto. Um rótulo que descreve
 * a regra antiga é pior que rótulo nenhum, porque quem leu confiou.
 *
 * Recebe `roles` (não a categoria) de propósito: o formulário pode ampliar a
 * audiência caso a caso, e a frase precisa descrever o que está selecionado
 * AGORA, não o default de onde ela partiu.
 */
export function describeAudience(roles: readonly ContractPartyRole[]): string {
  // Ordena pela ordem canônica, não pela ordem em que vieram: a mesma audiência
  // precisa produzir a mesma frase toda vez, ou a tela pisca entre "inquilino e
  // proprietário" e "proprietário e inquilino" sem nada ter mudado.
  const ordenados = CONTRACT_PARTY_ROLES.filter((r) => roles.includes(r))

  // Audiência vazia é documento que ninguém vê. Não é caso impossível — é o que
  // sobra quando alguém desmarca tudo — e falhar calado aqui produz um arquivo
  // publicado que o cliente jura não existir.
  if (!ordenados.length) return 'Ninguém vê este documento'

  const nomes = ordenados.map((r) => CONTRACT_PARTY_LABELS[r])
  if (nomes.length === 1) return `Só o ${nomes[0]} vê`
  const ultimo = nomes[nomes.length - 1]
  return `${nomes.slice(0, -1).join(', ')} e ${ultimo} veem`
}

/** Estado do recurso pago, como está gravado em `tenant_features`. */
export interface RecursoDoTenant {
  enabled: boolean
  /** Carência: vale ATÉ ESTE DIA, inclusive, mesmo com `enabled = false`. */
  graceUntil: string | null
}

/**
 * O recurso está valendo hoje?
 *
 * ⚠️ Esta função tem que dar a MESMA resposta que `is_portal_user()` no banco,
 * que é quem de fato fecha o acesso. Lá a condição é
 * `f.enabled or coalesce(f.grace_until, '-infinity') >= current_date`, com
 * `grace_until` do tipo `date`.
 *
 * Duas consequências que uma leitura desatenta erra:
 *   - a comparação é `>=` e por DIA, não `>` por instante. No próprio dia da
 *     carência o acesso ainda vale. Uma versão anterior daqui usava
 *     `graceUntil > now()`, que cortava um dia antes do banco — o servidor
 *     devolveria 403 enquanto a RLS ainda liberava, e o suporte procuraria o
 *     problema no lugar errado.
 *   - ausência de registro é DESLIGADO. É o lado seguro para recurso pago:
 *     tenant novo não ganha a Área do Cliente por esquecimento.
 */
export function recursoAtivo(
  recurso: RecursoDoTenant | null | undefined,
  hoje: Date = new Date(),
): boolean {
  if (!recurso) return false
  if (recurso.enabled) return true
  if (!recurso.graceUntil) return false

  // Compara por dia, no mesmo formato que o banco guarda (YYYY-MM-DD).
  const dia = String(recurso.graceUntil).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false

  const hojeISO = hoje.toISOString().slice(0, 10)
  return dia >= hojeISO
}
