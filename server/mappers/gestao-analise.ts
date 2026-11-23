import { z } from 'zod'

/**
 * Análise do financeiro, compartilhada por venda e locação. Fora do schema, o Zod descartaria `analiseFin` na leitura
 * (chave desconhecida) e a análise sumiria no próximo salvar.
 */
export const analiseFinSchema = z.object({
  status: z.enum(['rascunho', 'em-analise', 'aprovado', 'devolvido']),
  enviadoPor: z.string().optional(),
  enviadoEm: z.string().optional(),
  decididoPor: z.string().optional(),
  decididoEm: z.string().optional(),
  motivo: z.string().optional(),
})
