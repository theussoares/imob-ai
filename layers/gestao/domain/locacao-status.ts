import type { StatusLocacao, TomStatus } from './types'

export const STATUS_LOCACAO: StatusLocacao[] = [
  'Em abertura',
  'Aguardando documentação',
  'Aguardando garantia',
  'Aguardando vistoria de entrada',
  'Contrato e aluguel',
  'Ativa',
  'Encerrada',
]

export const TOM_STATUS_LOCACAO: Record<StatusLocacao, TomStatus> = {
  'Em abertura': 'neutral',
  'Aguardando documentação': 'amber',
  'Aguardando garantia': 'amber',
  'Aguardando vistoria de entrada': 'amber',
  'Contrato e aluguel': 'purple',
  Ativa: 'green',
  Encerrada: 'neutral',
}

export const ETAPAS_LOCACAO = [
  'Abertura',
  'Documentos do locatário',
  'Documentos do locador',
  'Documentos do imóvel',
  'Garantia',
  'Vistoria',
  'Contrato e financeiro',
  'Acompanhamento',
] as const

export const TOTAL_ETAPAS_LOCACAO = ETAPAS_LOCACAO.length

/** Estado final: só consulta (e arquivar). */
export function locacaoFinal(s: StatusLocacao): boolean {
  return s === 'Encerrada'
}

/**
 * O status acompanha a etapa, em vez de ser escolhido à mão como na venda: a
 * locação não tem negociação livre, cada etapa é um marco. Etapa 8 só é «Ativa»
 * depois de a 7 (contrato) estar concluída.
 */
export function statusPorEtapa(etapa: number, concluidas: boolean[]): StatusLocacao {
  if (etapa <= 1) return 'Em abertura'
  if (etapa <= 4) return 'Aguardando documentação'
  if (etapa === 5) return 'Aguardando garantia'
  if (etapa === 6) return 'Aguardando vistoria de entrada'
  if (etapa === 7) return 'Contrato e aluguel'
  return concluidas[6] ? 'Ativa' : 'Contrato e aluguel'
}
