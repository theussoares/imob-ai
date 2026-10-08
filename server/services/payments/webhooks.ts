import type { EventoDePagamento, PaymentProvider } from './provider'
import { eventoDoAsaas } from './asaas'
import { webhookDaCora } from './cora'

/**
 * Webhook → `EventoDePagamento`, por provedor. O endpoint não conhece regra de
 * nenhum deles: só entrega cabeçalhos e corpo e recebe o evento (ou `null`).
 *
 * `autenticado` é decidido pelo chamador (a prova do Asaas é um token comparado
 * com hash; a da Cora não existe e o `webhook_id` secreto da URL já foi
 * conferido ao achar a conta), por isso aqui só entra o que é parse.
 */

export interface EntradaDeWebhook {
  cabecalho(nome: string): string | undefined
  corpo(): Promise<unknown>
}

export async function lerEventoDoAsaas(e: EntradaDeWebhook): Promise<EventoDePagamento | null> {
  return eventoDoAsaas(await e.corpo())
}

/**
 * A Cora manda o webhook sem corpo e sem assinatura. Nada do que vem nele é
 * confiável como FATO: usamos só o id do boleto e perguntamos à API o que
 * aconteceu. Um POST forjado, mesmo com a URL certa, no máximo faz uma consulta
 * que devolve a verdade.
 */
export async function lerEventoDaCora(e: EntradaDeWebhook, cora: PaymentProvider): Promise<EventoDePagamento | null> {
  const w = webhookDaCora((n) => e.cabecalho(n))
  if (!w) return null
  const { evento } = await cora.consultar(w.resourceId)
  if (!evento) return null
  // O id do evento REAL, não o sintético da consulta: é ele que a Cora
  // reenvia igual e que o diário usa para o reenvio virar no-op.
  return { ...evento, eventId: w.eventId, bruto: w.bruto }
}
