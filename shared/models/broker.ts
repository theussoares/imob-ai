/** Corretor cadastrado (por tenant). Dado interno — não exposto no site público. */
export interface Broker {
  id: string
  tenantId: string
  name: string
  phone: string | null
  email: string | null
  creci: string | null
  active: boolean
  /**
   * Se o cadastro está ligado a um login do painel.
   *
   * Booleano em vez do `user_id` cru de propósito: a tela só precisa saber se já
   * tem acesso, e o id da conta de autenticação não tem por que trafegar até o
   * navegador. Quem precisa do id é o servidor, que lê a coluna direto.
   */
  hasPanelAccess: boolean
}

export interface BrokerInput {
  name: string
  phone?: string | null
  email?: string | null
  creci?: string | null
  active?: boolean
}
