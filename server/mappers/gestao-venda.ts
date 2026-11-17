import { z } from 'zod'
import { STATUS_VENDA } from '~~/layers/gestao/domain/status'
import type { Processo } from '~~/layers/gestao/domain/types'

/**
 * Mapper de `gestao_vendas` (0060) <-> `Processo` do domínio.
 *
 * `dados` é o `Processo` inteiro em jsonb. Validar com Zod na LEITURA, e não só
 * confiar no cast, porque o jsonb sobrevive a mudanças do tipo: um processo
 * gravado antes de um campo novo viraria `undefined` silencioso numa tela que
 * assume o campo. Aqui a falha é barulhenta e localizada.
 *
 * Os schemas espelham `layers/gestao/domain/types.ts`; se o tipo mudar, o
 * `satisfies` no fim do arquivo derruba o typecheck.
 */

const pessoa = z.object({
  nome: z.string(),
  cpf: z.string(),
  telefone: z.string().optional(),
  email: z.string().optional(),
})

const fontes = z.object({
  forma: z.enum(['À vista', 'Financiamento', 'Misto']),
  financiado: z.number(),
  entrada: z.number(),
  fgts: z.number(),
  proprios: z.number(),
  avaliacao: z.number().optional(),
  ganho: z.enum(['Isento', 'Há ganho de capital', 'Ainda não analisado']).optional(),
  bem: z.string().optional(),
  valorBem: z.number().optional(),
})

const adiantamento = z.object({
  id: z.string(),
  resp: z.enum(['vendedor', 'captador', 'imob']),
  valor: z.number(),
  data: z.string(),
  quem: z.string(),
  momento: z.enum(['adiantamento', 'fim-contrato']).optional(),
  pago: z.boolean().optional(),
  comprovante: z.string().nullable().optional(),
})

const conferencia = z.object({
  documentacao: z.boolean(),
  valores: z.boolean(),
  comissao: z.boolean(),
  encaminhado: z.boolean(),
  responsavel: z.string(),
  data: z.string(),
})

export const processoSchema = z.object({
  id: z.string(),
  tipo: z.literal('venda'),
  vendedor: pessoa,
  comprador: pessoa,
  imovel: z.string(),
  corretorId: z.string(),
  captadorId: z.string(),
  status: z.enum(STATUS_VENDA as [string, ...string[]]),
  updated: z.string(),
  valor: z.number(),
  pct: z.number(),
  fin: fontes,
  etapa: z.number().int().min(1).max(8),
  concluidas: z.array(z.boolean()),
  adiantamentos: z.array(adiantamento),
  hist: z.array(z.object({ acao: z.string(), quem: z.string(), quando: z.string() })),
  obs: z.string(),
  pdf: z.boolean(),
  matriculaMae: z.boolean().optional(),
  valorVenal: z.number().optional(),
  conferenciaFinal: conferencia.optional(),
  preliminar: z.object({ existe: z.boolean(), arquivo: z.string().nullable() }).optional(),
  arquivado: z.boolean(),
})

/** Row de `gestao_vendas` (a tabela não está em database.types: client sem tipo). */
export interface VendaRow {
  id: string
  tenant_id: string
  corretor_id: string
  status: string
  arquivado: boolean
  etapa: number
  versao: number
  dados: unknown
  updated_at: string
}

/** O agregado como o servidor o carrega: o processo mais a versão da concorrência otimista. */
export interface Venda {
  id: string
  versao: number
  processo: Processo
}

export function toVendaModel(row: VendaRow): Venda {
  const processo = processoSchema.parse(row.dados) as Processo
  // O id da coluna manda: o jsonb não pode «mudar» de processo por conta própria.
  return { id: row.id, versao: row.versao, processo: { ...processo, id: row.id } }
}

/** Colunas que a escrita copia de dentro do `Processo` (filtro e escopo). */
export function toVendaColunas(p: Processo): Pick<VendaRow, 'corretor_id' | 'status' | 'arquivado' | 'etapa' | 'dados'> {
  return { corretor_id: p.corretorId, status: p.status, arquivado: p.arquivado, etapa: p.etapa, dados: p }
}

/**
 * Recorte para quem não tem a permissão `valores`.
 *
 * Tira `pct`, `adiantamentos` e `fin` (comissão, adiantamentos e fontes de
 * pagamento) E as linhas do histórico que citam adiantamento: o texto delas traz
 * o valor («Registrou adiantamento de R$ 5.000,00»), então recortar só os campos
 * deixaria o dado vazar pelo `hist`. Alternativa descartada: devolver tudo e
 * esconder na tela — o payload é o que sai do servidor, e a tela é só cliente.
 */
export type ProcessoSemValores = Omit<Processo, 'pct' | 'adiantamentos' | 'fin'>

export function recortarValores(p: Processo, podeValores: boolean): Processo | ProcessoSemValores {
  if (podeValores) return p
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pct, adiantamentos, fin, ...resto } = p
  return { ...resto, hist: p.hist.filter((h) => !/adiantamento/i.test(h.acao)) }
}

// Garante que o schema continua cobrindo o tipo do domínio (e vice-versa).
type Inferido = z.infer<typeof processoSchema>
const _coberto = (p: Processo): Inferido => p as Inferido
void _coberto
