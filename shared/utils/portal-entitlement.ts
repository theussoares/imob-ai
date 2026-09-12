/**
 * O recurso "portal" está válido para este tenant?
 *
 * Espelha o termo de entitlement que a migration 0032 pôs dentro de
 * `is_portal_user()`. A duplicação serve a uma coisa só: **mensagem de erro**.
 * A RLS sabe dizer sim ou não, mas não sabe dizer por quê — e "sua lista de
 * contratos está vazia" para quem tem contrato é pior que um erro.
 *
 * A regra de acesso continua sendo a do banco. Esta função não libera nada: ela
 * só explica uma recusa que já aconteceu.
 */

export type PortalEntitlementStatus =
  /** Contratado e em dia. */
  | 'ativo'
  /** Não contratado, ou nunca ligado. */
  | 'sem_plano'
  /** Desligado, mas dentro da carência — o cliente continua entrando. */
  | 'em_carencia'
  /** Desligado e fora da carência. */
  | 'suspenso'

export interface PortalFeatureRow {
  enabled: boolean
  /** `YYYY-MM-DD`, ou nulo quando não há carência. */
  graceUntil: string | null
}

/**
 * `today` entra por parâmetro para o teste não depender do relógio. O formato é
 * `YYYY-MM-DD` porque a coluna é `date` — comparar string ISO de data é seguro e
 * evita o fuso virar bug de um dia.
 */
export function portalEntitlementStatus(
  row: PortalFeatureRow | null | undefined,
  today: string,
): PortalEntitlementStatus {
  // Ausência de linha é DESLIGADO, igual ao banco. É o default que permite subir
  // o portal em produção sem ligar para ninguém.
  if (!row) return 'sem_plano'
  if (row.enabled) return 'ativo'
  if (row.graceUntil && row.graceUntil >= today) return 'em_carencia'
  return 'suspenso'
}

/** O cliente consegue entrar? Carência conta como sim. */
export function canAccessPortal(status: PortalEntitlementStatus): boolean {
  return status === 'ativo' || status === 'em_carencia'
}

/**
 * A mensagem que o CLIENTE vê.
 *
 * ⚠️ Nunca menciona pagamento, fatura ou inadimplência. Quem está do outro lado
 * é o inquilino ou o proprietário — expor a situação comercial da imobiliária
 * para os clientes dela é dano à imagem de terceiro, e transforma uma cobrança
 * em processo. O status preciso vai para o log; para a tela vai isto.
 */
export function portalUnavailableMessage(): string {
  return 'A área do cliente está temporariamente indisponível. Entre em contato com a imobiliária.'
}

/** Data de hoje em `YYYY-MM-DD`, para comparar com a coluna `date`. */
export function todayISODate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}
