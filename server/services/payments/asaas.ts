import type { PaymentEnvironment, SettlementMethod } from '~~/shared/models/cobranca'
import { arred } from '~~/shared/models/cobranca'
import type {
  CobrancaEmitida,
  CobrancaParaEmitir,
  EventoDePagamento,
  Pagador,
  PaymentProvider,
  TipoDeEvento,
} from './provider'
import { ErroDoProvedor } from './provider'

/**
 * Adaptador do Asaas (API v3).
 *
 * Cada imobiliária usa a PRÓPRIA conta e a própria chave (spec B2): o dinheiro
 * cai no CNPJ dela e a plataforma nunca custodia. Por isso o adaptador é
 * instanciado por requisição com a chave daquele tenant, nunca um singleton.
 *
 * Referência: docs.asaas.com (cobranças, clientes, webhooks, sandbox).
 */

const BASE: Record<PaymentEnvironment, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
}

/**
 * Os eventos que registramos no webhook. Menos é melhor: o Asaas manda TODO
 * evento assinado, e cada um é uma função invocada e uma linha no diário.
 */
export const EVENTOS_ASSINADOS = [
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
] as const

type Fetch = typeof fetch

export interface OpcoesAsaas {
  apiKey: string
  ambiente: PaymentEnvironment
  fetch?: Fetch
}

/** Telefone como o Asaas quer: DDD + número, sem o 55. */
export function telefoneParaAsaas(digitos: string | null): string | undefined {
  if (!digitos) return undefined
  const d = digitos.replace(/\D/g, '')
  return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d || undefined
}

export function criarAsaas(op: OpcoesAsaas): PaymentProvider {
  const f = op.fetch ?? fetch
  const base = BASE[op.ambiente]

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    let res: Response
    try {
      res = await f(`${base}${caminho}`, {
        method: metodo,
        headers: {
          access_token: op.apiKey,
          'Content-Type': 'application/json',
          // Obrigatório para contas criadas desde 13/06/2024: sem ele o Asaas
          // recusa a requisição, e a mensagem não diz por quê.
          'User-Agent': `Moradi/1.0 (Nuxt; ${op.ambiente})`,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      throw new ErroDoProvedor(`Não foi possível falar com o Asaas agora (${(e as Error).name}). Tente de novo.`)
    }
    const texto = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {}
    } catch {
      // Página de erro HTML do balanceador (502/503): sem JSON, cai no status.
    }
    if (res.status === 401 || res.status === 403) {
      throw new ErroDoProvedor(
        'O Asaas recusou a chave de API. Confira se ela é do ambiente escolhido (sandbox ou produção) e se não foi revogada.',
        true,
      )
    }
    if (!res.ok) {
      // O Asaas devolve `errors: [{ code, description }]` em português — é a
      // melhor mensagem que a imobiliária pode ler.
      const erros = (json.errors as { description?: string }[] | undefined)?.map((e) => e.description).filter(Boolean)
      throw new ErroDoProvedor(erros?.length ? `Asaas: ${erros.join(' ')}` : `O Asaas respondeu ${res.status}.`)
    }
    return json as T
  }

  return {
    nome: 'asaas',
    ambiente: op.ambiente,

    async verificarConta() {
      const info = await chamar<{ companyName?: string; name?: string }>('GET', '/myAccount/commercialInfo/')
      return { nomeDaConta: info.companyName || info.name || null }
    },

    async registrarWebhook(url, segredo, email) {
      const r = await chamar<{ id?: string }>('POST', '/webhooks', {
        name: 'Moradi — cobranças de aluguel',
        url,
        email: email ?? undefined,
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: segredo,
        // Em ordem: um "pago" não pode chegar antes do "criado" que ele baixa.
        sendType: 'SEQUENTIALLY',
        events: EVENTOS_ASSINADOS,
      })
      return { externalId: r.id ?? null }
    },

    async removerWebhook(externalId) {
      await chamar('DELETE', `/webhooks/${encodeURIComponent(externalId)}`)
    },

    async criarCliente(p: Pagador) {
      const r = await chamar<{ id: string }>('POST', '/customers', {
        name: p.nome,
        cpfCnpj: p.documento,
        email: p.email ?? undefined,
        mobilePhone: telefoneParaAsaas(p.telefone),
        externalReference: p.referencia,
        // Sem notificação do Asaas: e-mail, SMS e WhatsApp deles são cobrados
        // por envio na conta da imobiliária, e ela não pediu isso ao conectar.
        // O inquilino vê o boleto na Área do Cliente; a régua de cobrança é
        // decisão futura e consciente (spec, seção 7).
        notificationDisabled: true,
      })
      return { externalId: r.id }
    },

    async emitir(c: CobrancaParaEmitir): Promise<CobrancaEmitida> {
      const corpo: Record<string, unknown> = {
        customer: c.clienteExterno,
        // BOLETO no Asaas já sai com QR Code Pix impresso: o inquilino escolhe
        // na hora de pagar, e a imobiliária não precisa emitir duas vezes.
        billingType: 'BOLETO',
        value: arred(c.valor),
        dueDate: c.vencimento,
        description: c.descricao,
        externalReference: c.referencia,
      }
      if (c.multaPercent) corpo.fine = { value: c.multaPercent, type: 'PERCENTAGE' }
      // `interest.value` no Asaas é percentual AO MÊS, cobrado pró-rata ao dia.
      if (c.jurosMensalPercent) corpo.interest = { value: c.jurosMensalPercent }

      const p = await chamar<{ id: string; invoiceUrl?: string; bankSlipUrl?: string }>('POST', '/payments', corpo)

      // Linha digitável e Pix são chamadas à parte. Falhar nelas NÃO desfaz a
      // emissão: o boleto existe e o link da fatura (invoiceUrl) já mostra os
      // dois. Um Pix que falha costuma ser conta sem chave Pix cadastrada.
      const [linha, pix] = await Promise.allSettled([
        chamar<{ identificationField?: string }>('GET', `/payments/${p.id}/identificationField`),
        chamar<{ payload?: string }>('GET', `/payments/${p.id}/pixQrCode`),
      ])
      return {
        externalId: p.id,
        paymentUrl: p.invoiceUrl ?? null,
        bankSlipUrl: p.bankSlipUrl ?? null,
        digitableLine: linha.status === 'fulfilled' ? (linha.value.identificationField ?? null) : null,
        pixCopyPaste: pix.status === 'fulfilled' ? (pix.value.payload ?? null) : null,
      }
    },

    async cancelar(externalId) {
      await chamar('DELETE', `/payments/${encodeURIComponent(externalId)}`)
    },

    async baixarPorFora(externalId, valor, data) {
      await chamar('POST', `/payments/${encodeURIComponent(externalId)}/receiveInCash`, {
        paymentDate: data,
        value: arred(valor),
        notifyCustomer: false,
      })
    },

    async simularPagamento(externalId) {
      if (op.ambiente !== 'sandbox') {
        throw new ErroDoProvedor('Simular pagamento só existe no sandbox.')
      }
      // A baixa volta pelo webhook, pelo mesmo caminho de um pagamento real —
      // que é justamente o que a demonstração precisa provar.
      await chamar('POST', `/sandbox/payment/${encodeURIComponent(externalId)}/confirm`)
      return null
    },
  }
}

const TIPOS: Record<string, TipoDeEvento> = {
  PAYMENT_RECEIVED: 'pago',
  PAYMENT_CONFIRMED: 'pago',
  PAYMENT_DELETED: 'cancelado',
  PAYMENT_REFUNDED: 'estornado',
  PAYMENT_OVERDUE: 'vencido',
}

function metodo(billingType: unknown): SettlementMethod {
  if (billingType === 'BOLETO') return 'boleto'
  if (billingType === 'PIX') return 'pix'
  return 'outro'
}

/**
 * Corpo do webhook → evento normalizado. `null` quando não é um evento de
 * cobrança (o Asaas manda outros tipos se alguém assinar à mão no painel dele).
 *
 * Função pura e separada do adaptador: o webhook só instancia o adaptador
 * depois de saber de quem é o evento, e o parse não precisa de chave.
 *
 * `payment.value`: quando o inquilino paga com atraso, o Asaas atualiza o
 * `value` para o total pago (com multa e juros) e guarda o original em
 * `originalValue`. O que interessa à liquidação é o que ENTROU.
 */
export function eventoDoAsaas(corpo: unknown): EventoDePagamento | null {
  if (!corpo || typeof corpo !== 'object') return null
  const b = corpo as { id?: unknown; event?: unknown; dateCreated?: unknown; payment?: Record<string, unknown> }
  if (typeof b.id !== 'string' || typeof b.event !== 'string' || !b.payment || typeof b.payment !== 'object') return null
  const p = b.payment
  const data =
    (typeof p.clientPaymentDate === 'string' && p.clientPaymentDate) ||
    (typeof p.paymentDate === 'string' && p.paymentDate) ||
    (typeof b.dateCreated === 'string' && b.dateCreated.slice(0, 10)) ||
    new Date().toISOString().slice(0, 10)
  return {
    eventId: b.id,
    tipo: TIPOS[b.event] ?? 'outro',
    bruto: b.event,
    externalId: typeof p.id === 'string' ? p.id : null,
    valor: typeof p.value === 'number' ? arred(p.value) : 0,
    data: data.slice(0, 10),
    metodo: p.status === 'RECEIVED_IN_CASH' ? 'dinheiro' : metodo(p.billingType),
    emDinheiro: p.status === 'RECEIVED_IN_CASH',
  }
}
