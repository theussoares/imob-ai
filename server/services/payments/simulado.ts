import { randomUUID } from 'node:crypto'
import type { PaymentEnvironment } from '~~/shared/models/cobranca'
import { arred } from '~~/shared/models/cobranca'
import type { PaymentProvider } from './provider'

/**
 * Provedor que "emite" e "paga" sem sair do servidor.
 *
 * Existe por dois motivos registrados na spec (B1 e o critério de corte do
 * cronograma): os testes não podem depender de rede, e a demonstração não pode
 * cair porque o sandbox de terceiro caiu. Mesma tela, mesmo fluxo, mesma
 * função de baixa — o que muda é que nada disto vale dinheiro.
 *
 * A linha digitável é visivelmente falsa (começa com zeros) para ninguém
 * tentar pagar um boleto de demonstração no app do banco.
 */
export function criarSimulado(ambiente: PaymentEnvironment = 'sandbox'): PaymentProvider {
  return {
    nome: 'simulado',
    ambiente,
    async verificarConta() {
      return { nomeDaConta: 'Conta de demonstração' }
    },
    async registrarWebhook() {
      return { externalId: null }
    },
    async removerWebhook() {},
    async criarCliente(p) {
      return { externalId: `sim_cus_${p.referencia}` }
    },
    async emitir(c) {
      const id = `sim_pay_${randomUUID()}`
      const centavos = String(Math.round(arred(c.valor) * 100)).padStart(10, '0')
      return {
        externalId: id,
        paymentUrl: null,
        bankSlipUrl: null,
        digitableLine: `00000.00000 00000.000000 00000.000000 0 0000${centavos}`,
        pixCopyPaste: `00020101021226SIMULADO-MORADI-${c.referencia.slice(0, 8)}5204000053039865406${arred(c.valor).toFixed(2)}6304SIMU`,
      }
    },
    async cancelar() {},
    async baixarPorFora() {},
    // No simulado o pagamento é processado na hora (sem webhook): não há
    // estado lá que não esteja aqui.
    async consultar() {
      return null
    },
    async simularPagamento(externalId, valor) {
      return {
        eventId: `sim_evt_${randomUUID()}`,
        tipo: 'pago',
        bruto: 'SIMULADO_PAGO',
        externalId,
        valor: arred(valor),
        data: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
        metodo: 'pix',
        emDinheiro: false,
      }
    },
  }
}
