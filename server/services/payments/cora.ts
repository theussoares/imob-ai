import type { PaymentEnvironment, SettlementMethod } from '~~/shared/models/cobranca'
import { arred } from '~~/shared/models/cobranca'
import type {
  CobrancaEmitida,
  CobrancaParaEmitir,
  EventoDePagamento,
  Pagador,
  PaymentProvider,
  SituacaoNoProvedor,
} from './provider'
import { ErroDoProvedor } from './provider'
import type { RespostaDaCora, TransporteCora } from './cora-transporte'
import { uuidDeterministico } from './cora-transporte'

/**
 * Adaptador da Cora (Integração Direta: client_id + certificado mTLS).
 *
 * O que a Cora NÃO tem, e como o adaptador cobre (o resto do sistema não sabe):
 *   - cadastro de cliente → `criarCliente` é no-op; os dados do pagador vão
 *     inline em `emitir`;
 *   - "recebido em dinheiro" → `baixarPorFora` CANCELA o boleto lá, para ele
 *     não ser pago depois. Quem registra a liquidação é `baixarManualmente`;
 *   - assinatura de webhook → o webhook chega SEM corpo; a autoria vem do
 *     `webhook_id` secreto da URL e o fato, da reconsulta (`consultar`).
 *
 * Valores em centavos inteiros na API; centavos nunca saem deste arquivo.
 */

/** Eventos assinados: o mínimo que muda o estado de uma cobrança. */
export const EVENTOS_ASSINADOS_CORA = ['paid', 'canceled', 'overdue'] as const

export interface OpcoesCora {
  ambiente: PaymentEnvironment
  transporte: TransporteCora
}

type Json = Record<string, unknown>

const aCentavos = (reais: number): number => Math.round(arred(reais) * 100)
const deCentavos = (c: unknown): number => (typeof c === 'number' ? arred(c / 100) : 0)

function tipoDeDocumento(doc: string): 'CPF' | 'CNPJ' {
  return doc.length > 11 ? 'CNPJ' : 'CPF'
}

/**
 * Erro da Cora: `{ code, message, errors: [{ id, message }] }` (400) ou
 * `{ code: "REC-xxxx", message }` (422). Num 400, o `id` diz QUAL campo falhou
 * ("customer.email"), e é o que a imobiliária precisa para corrigir o cadastro.
 */
function mensagemDeErro(r: RespostaDaCora): string {
  const j = (r.json ?? {}) as { code?: unknown; message?: unknown; errors?: unknown }
  const codigo = typeof j.code === 'string' ? j.code : null
  if (codigo === 'REC-0006') return 'A Cora informa que este boleto já foi pago. Consulte no provedor para trazer o pagamento.'
  if (codigo === 'REC-0007') {
    return 'A Cora não deixa pagar em stage um boleto emitido pela própria conta. Pague por outra conta de teste.'
  }
  const campos = Array.isArray(j.errors)
    ? (j.errors as { id?: unknown; message?: unknown }[])
        .filter((e) => typeof e?.message === 'string')
        .map((e) => (typeof e.id === 'string' ? `${e.id}: ${e.message}` : String(e.message)))
    : []
  if (campos.length) return `Cora recusou os dados (${campos.join('; ')}).`
  const texto = typeof j.message === 'string' ? j.message : null
  return texto ? `Cora: ${texto}${codigo ? ` (${codigo})` : ''}` : `A Cora respondeu ${r.status}.`
}

function exigirOk(r: RespostaDaCora): Json {
  if (r.status < 200 || r.status >= 300) throw new ErroDoProvedor(mensagemDeErro(r))
  return r.json ?? {}
}

export function criarCora(op: OpcoesCora): PaymentProvider {
  const { transporte } = op

  return {
    nome: 'cora',
    ambiente: op.ambiente,

    async verificarConta() {
      // Obter o token já prova client_id + certificado. A API não expõe o nome
      // da conta no escopo da Integração Direta.
      await transporte.token()
      return { nomeDaConta: null }
    },

    async registrarWebhook(url) {
      const criados: string[] = []
      try {
        for (const trigger of EVENTOS_ASSINADOS_CORA) {
          const r = exigirOk(
            await transporte.chamar('POST', '/endpoints', { url, resource: 'invoice', trigger }, {
              'Idempotency-Key': uuidDeterministico(`endpoint:${url}:${trigger}`),
            }),
          )
          if (typeof r.id === 'string') criados.push(r.id)
        }
      } catch (e) {
        // Meio caminho registrado é webhook órfão apontando para uma URL que
        // não vai existir: desfaz o que deu certo antes de subir o erro.
        for (const id of criados) await this.removerWebhook(id).catch(() => undefined)
        throw e
      }
      return { externalId: criados.join(',') || null }
    },

    async removerWebhook(externalId) {
      for (const id of externalId.split(',').filter(Boolean)) {
        const r = await transporte.chamar('DELETE', `/endpoints/${encodeURIComponent(id)}`)
        // 404: já não existe, que é o que se queria.
        if (r.status !== 404) exigirOk(r)
      }
    },

    async criarCliente(p: Pagador) {
      return { externalId: `inline:${p.referencia}` }
    },

    async emitir(c: CobrancaParaEmitir): Promise<CobrancaEmitida> {
      const p = c.pagador
      if (!p) throw new ErroDoProvedor('Faltam os dados do inquilino para emitir pela Cora.')
      if (!p.email) throw new ErroDoProvedor('A Cora exige o e-mail do inquilino. Preencha o e-mail no cadastro dele.')

      const termos: Json = { due_date: c.vencimento }
      if (c.multaPercent) termos.fine = { rate: c.multaPercent }
      if (c.jurosMensalPercent) termos.interest = { rate: c.jurosMensalPercent }

      const r = exigirOk(
        await transporte.chamar(
          'POST',
          '/v2/invoices/',
          {
            code: c.referencia,
            customer: {
              name: p.nome.slice(0, 60),
              email: p.email.slice(0, 60),
              document: { identity: p.documento, type: tipoDeDocumento(p.documento) },
            },
            services: [{ name: 'Aluguel', description: c.descricao.slice(0, 100), amount: aCentavos(c.valor) }],
            payment_terms: termos,
            // Boleto com QR Code Pix no mesmo documento, como no Asaas.
            payment_forms: ['BANK_SLIP', 'PIX'],
          },
          // Derivada da cobrança: o retry de uma emissão que a rede derrubou
          // reencontra o MESMO boleto em vez de criar outro.
          { 'Idempotency-Key': uuidDeterministico(`charge:${c.referencia}:v1`) },
        ),
      )
      return emitidaDaCora(r)
    },

    async cancelar(externalId) {
      const r = await transporte.chamar('DELETE', `/v2/invoices/${encodeURIComponent(externalId)}`)
      if (r.status !== 204 && (r.status < 200 || r.status >= 300)) throw new ErroDoProvedor(mensagemDeErro(r))
    },

    async baixarPorFora(externalId) {
      // Sem "recebido em dinheiro" na Cora: tirar o boleto de circulação é o
      // que impede o inquilino de pagá-lo depois da baixa. Se a Cora diz que já
      // foi pago (REC-0006), o erro sobe e `baixarManualmente` sincroniza em
      // vez de liquidar em dobro.
      await this.cancelar(externalId)
    },

    async consultar(externalId) {
      const fatura = exigirOk(await transporte.chamar('GET', `/v2/invoices/${encodeURIComponent(externalId)}`))
      return { evento: eventoDaFatura(fatura), situacao: situacaoDaFatura(fatura) }
    },

    async simularPagamento(externalId) {
      if (op.ambiente !== 'sandbox') throw new ErroDoProvedor('Simular pagamento só existe no sandbox.')
      exigirOk(
        await transporte.chamar('POST', '/v2/invoices/pay', { id: externalId }, {
          'Idempotency-Key': uuidDeterministico(`pagar-stage:${externalId}`),
        }),
      )
      // A baixa volta pelo webhook, como um pagamento real.
      return null
    },
  }
}

export function emitidaDaCora(f: Json): CobrancaEmitida {
  if (typeof f.id !== 'string') throw new ErroDoProvedor('A Cora não devolveu o identificador do boleto.')
  const opcoes = (f.payment_options ?? {}) as { bank_slip?: { url?: string; digitable?: string } }
  const pix = (f.pix ?? null) as { emv?: string } | null
  return {
    externalId: f.id,
    paymentUrl: null,
    bankSlipUrl: opcoes.bank_slip?.url ?? null,
    digitableLine: opcoes.bank_slip?.digitable ?? null,
    pixCopyPaste: pix?.emv ?? null,
  }
}

/** Cabeçalhos do webhook → o que a reconsulta precisa. `null` quando não é de fatura. */
export function webhookDaCora(cabecalho: (nome: string) => string | undefined): {
  eventId: string
  bruto: string
  resourceId: string
} | null {
  const eventId = cabecalho('webhook-event-id')
  const bruto = cabecalho('webhook-event-type')
  const resourceId = cabecalho('webhook-resource-id')
  if (!eventId || !bruto || !resourceId) return null
  if (!bruto.startsWith('invoice.') || !resourceId.startsWith('inv_')) return null
  return { eventId, bruto, resourceId }
}

function metodoDe(f: Json): SettlementMethod {
  const pagamentos = f.payments as { method?: string }[] | undefined
  const m = pagamentos?.[0]?.method
  if (m === 'PIX') return 'pix'
  if (m === 'BANK_SLIP') return 'boleto'
  return 'outro'
}

function dataDoPagamento(f: Json): string {
  const pagamentos = f.payments as { finalized_at?: string }[] | undefined
  const bruta = (typeof f.occurrence_date === 'string' && f.occurrence_date) || pagamentos?.[0]?.finalized_at
  return typeof bruta === 'string' && /^\d{4}-\d{2}-\d{2}/.test(bruta) ? bruta.slice(0, 10) : new Date().toISOString().slice(0, 10)
}

/**
 * Fatura da Cora → o evento que o webhook "teria" mandado. Em aberto ou vencida
 * não há nada a aplicar (`null`). O `eventId` do webhook real vem de fora;
 * sem ele, sintético (`consulta:<id>:<status>`) para o diário não os confundir.
 * A liquidação é idempotente por `cora:pago:<id>` nos dois caminhos.
 */
export function eventoDaFatura(f: Json, eventId?: string, bruto?: string): EventoDePagamento | null {
  if (typeof f.id !== 'string') return null
  const status = String(f.status ?? '')
  const id = eventId ?? `consulta:${f.id}:${status}`
  if (status === 'PAID') {
    return {
      eventId: id,
      tipo: 'pago',
      bruto: bruto ?? 'invoice.paid',
      externalId: f.id,
      valor: deCentavos(f.total_paid),
      data: dataDoPagamento(f),
      metodo: metodoDe(f),
      emDinheiro: false,
    }
  }
  if (status === 'CANCELLED') {
    return {
      eventId: id,
      tipo: 'cancelado',
      bruto: bruto ?? 'invoice.canceled',
      externalId: f.id,
      valor: 0,
      data: new Date().toISOString().slice(0, 10),
      metodo: 'outro',
      emDinheiro: false,
    }
  }
  return null
}

export function situacaoDaFatura(f: Json): SituacaoNoProvedor {
  const bruto = String(f.status ?? '')
  const status: SituacaoNoProvedor['status'] =
    bruto === 'PAID' ? 'paga'
      : bruto === 'CANCELLED' ? 'removida'
        : bruto === 'LATE' ? 'vencida'
          : ['OPEN', 'DRAFT', 'IN_PAYMENT', 'INITIATED'].includes(bruto) ? 'em_aberto'
            : 'outra'
  const termos = (f.payment_terms ?? {}) as { due_date?: string }
  return {
    status,
    bruto,
    vencimento: typeof termos.due_date === 'string' ? termos.due_date.slice(0, 10) : null,
    valor: typeof f.total_amount === 'number' ? deCentavos(f.total_amount) : null,
  }
}
