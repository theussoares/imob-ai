import type { PaymentEnvironment, PaymentProviderName, SettlementMethod } from '~~/shared/models/cobranca'

/**
 * A porta entre o sistema e quem emite o boleto (spec 25/09, B1).
 *
 * Nossa, estável, e pequena de propósito: o painel e o banco de dados só
 * conhecem estes tipos. Nome de status do Asaas (`PAYMENT_RECEIVED`,
 * `RECEIVED_IN_CASH`…) nunca sai do adaptador — é o que permite plugar um
 * agregador de bancos depois sem tocar em tela nem em tabela.
 */

export interface Pagador {
  nome: string
  /** Só dígitos. O boleto registrado exige. */
  documento: string
  email: string | null
  /** Só dígitos, com DDI 55 como o resto do sistema guarda. */
  telefone: string | null
  /** Id da pessoa aqui (portal_users.id) — para achar o cliente lá se o nosso vínculo se perder. */
  referencia: string
}

export interface CobrancaParaEmitir {
  clienteExterno: string
  valor: number
  vencimento: string
  descricao: string
  /** Id da cobrança aqui. */
  referencia: string
  multaPercent: number | null
  jurosMensalPercent: number | null
}

export interface CobrancaEmitida {
  externalId: string
  paymentUrl: string | null
  bankSlipUrl: string | null
  digitableLine: string | null
  pixCopyPaste: string | null
}

export type TipoDeEvento = 'pago' | 'cancelado' | 'estornado' | 'vencido' | 'outro'

/** Evento normalizado. É a única forma em que um webhook entra no sistema. */
export interface EventoDePagamento {
  eventId: string
  tipo: TipoDeEvento
  /** Nome cru do evento, só para o diário (`payment_webhook_events.event_type`). */
  bruto: string
  externalId: string | null
  valor: number
  data: string
  metodo: SettlementMethod
  /** Baixa "recebido em dinheiro" feita no provedor — pode ser eco da nossa. */
  emDinheiro: boolean
}

export class ErroDoProvedor extends Error {
  constructor(
    message: string,
    /** 401/403 do provedor = chave errada ou revogada. */
    readonly credencialInvalida = false,
  ) {
    super(message)
  }
}

export interface PaymentProvider {
  readonly nome: PaymentProviderName
  readonly ambiente: PaymentEnvironment
  /** Confere a chave e devolve o nome da conta, para a imobiliária reconhecer. */
  verificarConta(): Promise<{ nomeDaConta: string | null }>
  registrarWebhook(url: string, segredo: string, email: string | null): Promise<{ externalId: string | null }>
  removerWebhook(externalId: string): Promise<void>
  criarCliente(p: Pagador): Promise<{ externalId: string }>
  emitir(c: CobrancaParaEmitir): Promise<CobrancaEmitida>
  cancelar(externalId: string): Promise<void>
  /** Marca como recebida por fora, para o boleto deixar de ser pagável. */
  baixarPorFora(externalId: string, valor: number, data: string): Promise<void>
  /**
   * Só sandbox/simulado: "o inquilino pagou". No Asaas a confirmação volta
   * pelo webhook; no simulado, o evento é devolvido para o chamador processar
   * pelo MESMO caminho do webhook.
   */
  simularPagamento(externalId: string, valor: number): Promise<EventoDePagamento | null>
  /**
   * O estado da cobrança LÁ, no formato de evento, para passar pelo mesmo
   * caminho do webhook. Nulo quando não há nada a aplicar (em aberto, vencida).
   *
   * Existe porque o webhook pode não chegar: em localhost ele nunca chega, e em
   * produção o provedor pode ter pausado a fila. Sem consulta, a cobrança paga
   * lá ficava "Em aberto" aqui para sempre.
   */
  consultar(externalId: string): Promise<EventoDePagamento | null>
}
