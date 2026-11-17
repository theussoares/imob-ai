import { z } from 'zod'
import { FINALIDADES, type ConsultaFeita } from '~~/layers/gestao/domain/consulta'

/**
 * `gestao_consultas` (0063) <-> `ConsultaFeita` do domínio.
 *
 * Sem o tipo `Database` (a tabela só entra nos tipos gerados depois da migration
 * aplicada): o schema Zod é o tipo. `ator_user_id` fica na row e NÃO sai no modelo,
 * que só carrega o nome — o uuid do usuário não é assunto da tela.
 */

const restricaoSchema = z.object({
  fonte: z.enum(['SPC', 'Serasa']),
  credor: z.string(),
  valor: z.number(),
  desde: z.string(),
})

export const consultaRowSchema = z.object({
  id: z.string(),
  documento_mascarado: z.string(),
  tipo: z.enum(['cpf', 'cnpj']),
  finalidade: z.enum(FINALIDADES),
  contrato_id: z.string().nullable(),
  ator_nome: z.string(),
  situacao: z.enum(['sem-restricoes', 'com-restricoes']),
  score: z.number(),
  restricoes: z.array(restricaoSchema),
  quando: z.string(),
})
export type GestaoConsultaRow = z.infer<typeof consultaRowSchema>

export const COLUNAS_CONSULTA = 'id, documento_mascarado, tipo, finalidade, contrato_id, ator_nome, situacao, score, restricoes, quando'

const p = (n: number) => String(n).padStart(2, '0')

/** ISO → `dd/mm/aaaa hh:mm` no relógio de Brasília (sem horário de verão desde 2019: UTC-3). */
export function quandoBrasil(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export function toConsultaModel(row: unknown): ConsultaFeita {
  const r = consultaRowSchema.parse(row)
  return {
    id: r.id,
    documentoMascarado: r.documento_mascarado,
    tipo: r.tipo,
    finalidade: r.finalidade,
    contratoId: r.contrato_id,
    quem: r.ator_nome,
    quando: quandoBrasil(r.quando),
    situacao: r.situacao,
    score: r.score,
    restricoes: r.restricoes,
    simulada: true,
  }
}
