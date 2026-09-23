/**
 * Uma geração de texto por IA, para contagem de cota e auditoria de consumo.
 *
 * `kind` existe para que o segundo uso de IA (título, `alt` de imagem, resumo
 * de lead) não peça tabela nova. `model` existe para que comparar custo entre
 * modelos depois seja possível: sem ele, trocar o modelo apaga a linha de base.
 */
export const AI_GENERATION_KINDS = ['descricao'] as const
export type AiGenerationKind = (typeof AI_GENERATION_KINDS)[number]

/** `reservada` nasce ANTES da chamada; vira `concluida` ou `falhou` depois. */
export const AI_GENERATION_STATUSES = ['reservada', 'concluida', 'falhou'] as const
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number]

export interface AiGeneration {
  id: string
  tenantId: string
  propertyId: string | null
  createdBy: string | null
  kind: AiGenerationKind
  model: string
  status: AiGenerationStatus
  inputTokens: number
  outputTokens: number
  createdAt: string
}

/**
 * Teto mensal de gerações por imobiliária, e teto por minuto por pessoa.
 *
 * Moram em `shared/` e não junto do provedor porque quem as lê é o repository
 * de consumo — e importá-las de `server/utils/ai.ts` arrastaria o SDK inteiro
 * do provedor para dentro de um teste que não toca em rede.
 */
export const COTA_MENSAL_DESCRICAO = 100
export const COTA_MINUTO_DESCRICAO = 10
