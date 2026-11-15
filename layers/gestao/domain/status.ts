import type { StatusVenda, TomStatus } from './types'

export const STATUS_VENDA: StatusVenda[] = [
  'Em negociação',
  'Proposta realizada',
  'Proposta aprovada',
  'Aguardando documentação',
  'Documentação completa',
  'Em análise de financiamento',
  'Financiamento aprovado',
  'Contrato em elaboração',
  'Aguardando assinatura',
  'Contrato assinado',
  'Aguardando registro',
  'Venda concluída',
  'Venda cancelada',
]

export const TOM_STATUS: Record<StatusVenda, TomStatus> = {
  'Em negociação': 'neutral',
  'Proposta realizada': 'blue',
  'Proposta aprovada': 'blue',
  'Aguardando documentação': 'amber',
  'Documentação completa': 'green',
  'Em análise de financiamento': 'purple',
  'Financiamento aprovado': 'green',
  'Contrato em elaboração': 'purple',
  'Aguardando assinatura': 'amber',
  'Contrato assinado': 'green',
  'Aguardando registro': 'amber',
  'Venda concluída': 'green',
  'Venda cancelada': 'red',
}

/** Estados finais: o processo vira só consulta. */
export function statusFinal(s: StatusVenda): boolean {
  return s === 'Venda concluída' || s === 'Venda cancelada'
}

export const ETAPAS_VENDA = [
  'Abertura',
  'Docs do vendedor',
  'Docs do comprador',
  'Docs do imóvel',
  'Checklist comercial',
  'Conferência da recepção',
  'Análise jurídica',
  'Conclusão',
] as const

export const TOTAL_ETAPAS = ETAPAS_VENDA.length

/** Quantas etapas estão concluídas e o percentual (0..100, inteiro). */
export function progresso(concluidas: boolean[]): { feitas: number; pct: number; texto: string } {
  const feitas = concluidas.filter(Boolean).length
  return {
    feitas,
    pct: Math.round((feitas / TOTAL_ETAPAS) * 100),
    texto: `${feitas} de ${TOTAL_ETAPAS} etapas concluídas`,
  }
}
