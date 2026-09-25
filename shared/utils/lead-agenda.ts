import type { Lead } from '../models/lead'

/**
 * O que o dashboard mostra primeiro: quem está esperando resposta.
 *
 * O dashboard abria só com números do catálogo — quantos imóveis, quantos
 * publicados. É o que menos muda de um dia para o outro. O que muda, e tem
 * prazo, são os contatos: a pesquisa de tempo de resposta a leads online
 * (Harvard Business Review, "The Short Life of Online Sales Leads") mostra a
 * chance de qualificar o contato caindo muito depois da primeira hora. O dono
 * abre o app instalado para saber "tem alguém me esperando?", e a resposta
 * estava a uma tela de distância.
 *
 * A ordem é de urgência, não de chegada: retorno combinado e vencido primeiro
 * (é uma promessa quebrada), depois o contato novo que espera há MAIS tempo —
 * o de agora pouco ainda está no melhor momento, o de ontem já está perdendo.
 */

export interface LeadParaAtender {
  lead: Lead
  motivo: 'retorno_atrasado' | 'novo'
}

function ativo(l: Lead): boolean {
  return l.stage !== 'perdido' && l.stage !== 'fechado'
}

export function leadsParaAtender(leads: Lead[], now = Date.now(), limite = 5): {
  itens: LeadParaAtender[]
  total: number
} {
  const atrasados = leads
    .filter((l) => ativo(l) && !!l.nextContactAt && new Date(l.nextContactAt).getTime() <= now)
    .sort((a, b) => new Date(a.nextContactAt!).getTime() - new Date(b.nextContactAt!).getTime())

  const idsAtrasados = new Set(atrasados.map((l) => l.id))
  const novos = leads
    .filter((l) => l.stage === 'novo' && !idsAtrasados.has(l.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  const todos: LeadParaAtender[] = [
    ...atrasados.map((lead) => ({ lead, motivo: 'retorno_atrasado' as const })),
    ...novos.map((lead) => ({ lead, motivo: 'novo' as const })),
  ]
  return { itens: todos.slice(0, limite), total: todos.length }
}
