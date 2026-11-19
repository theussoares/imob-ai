import { z } from 'zod'
import type { Cobranca, ContratoLocacao, Locacao } from '~~/layers/gestao/domain/types'

/**
 * Locação do gestão <-> linha de `gestao_locacoes` (0062).
 *
 * O jsonb `dados` é terreno de escrita do servidor, mas o Zod roda nos dois
 * sentidos mesmo assim: na leitura porque uma linha editada à mão (ou gravada por
 * uma versão antiga do código) não pode chegar à tela com a forma errada; na
 * escrita porque o resultado das ações puras é o que vira dado, e só o schema
 * garante que ele continua sendo uma `Locacao`.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/
const texto = (max: number) => z.string().max(max)
const iso = z.string().regex(ISO)

export const pessoaSchema = z.object({
  nome: texto(200),
  cpf: texto(20),
  telefone: texto(40).optional(),
  email: texto(200).optional(),
})

export const vistoriaSchema = z.object({
  data: iso,
  responsavel: texto(200),
  fotos: z.array(texto(300)).max(100),
  observacao: texto(4000),
})

export const contratoSchema = z.object({
  valor: z.number().finite(),
  diaVencimento: z.number().int().min(1).max(28),
  inicio: iso,
  fim: iso,
  reajuste: z.enum(['IGP-M', 'IPCA', 'Outro']),
  taxaPct: z.number().min(0).max(100),
})

const forma = z.enum(['PIX', 'Dinheiro', 'Transferência', 'Boleto', 'Outro'])

const pagamento = z.object({
  id: texto(40),
  valor: z.number().finite(),
  data: iso,
  forma,
  comprovante: texto(300).nullable().optional(),
})

const repasse = z.object({
  valor: z.number().finite(),
  repassado: z.number().finite().optional(),
  feito: z.boolean(),
  data: iso.optional(),
  forma: forma.optional(),
  comprovante: texto(300).nullable().optional(),
})

const cobranca = z.object({
  id: texto(40),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  valor: z.number().finite(),
  vencimento: iso,
  pago: z.object({ data: iso, comprovante: texto(300) }).optional(),
  pagamentos: z.array(pagamento).max(200).optional(),
  repasse: repasse.optional(),
})

const STATUS = [
  'Em abertura',
  'Aguardando documentação',
  'Aguardando garantia',
  'Aguardando vistoria de entrada',
  'Contrato e aluguel',
  'Ativa',
  'Encerrada',
] as const

export const locacaoSchema = z.object({
  id: z.string().regex(/^L-\d{4}-\d{4,}$/),
  tipo: z.literal('locacao'),
  locador: pessoaSchema,
  locatario: pessoaSchema,
  imovelId: texto(80),
  imovel: texto(300),
  corretorId: texto(80),
  status: z.enum(STATUS),
  updated: texto(40),
  etapa: z.number().int().min(1).max(8),
  concluidas: z.array(z.boolean()).length(8),
  garantia: z.object({ tipo: z.enum(['Caução', 'Seguro-fiança', 'Fiador', 'Título de capitalização', 'Outra']), detalhe: texto(1000) }).optional(),
  vistoriaEntrada: vistoriaSchema.optional(),
  vistoriaSaida: vistoriaSchema.optional(),
  contrato: contratoSchema.optional(),
  cobrancas: z.array(cobranca).max(600),
  hist: z.array(z.object({ acao: texto(300), quem: texto(200), quando: texto(40) })).max(2000),
  obs: texto(8000),
  arquivado: z.boolean(),
})

export interface GestaoLocacaoRow {
  tenant_id: string
  id: string
  corretor_id: string | null
  imovel_id: string | null
  status: string
  arquivado: boolean
  etapa: number
  versao: number
  dados: unknown
  updated_at: string
}

/** Locação com o número de versão que o cliente devolve ao agir (concorrência otimista). */
export interface LocacaoVersionada {
  locacao: Locacao
  versao: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ehUuid = (s: string): boolean => UUID.test(s)

/**
 * As colunas mandam nos campos que filtram: se `dados` e coluna divergirem (edição
 * manual), vale a coluna, que é o que a listagem e o escopo do corretor usaram.
 */
export function toLocacaoModel(row: GestaoLocacaoRow): LocacaoVersionada {
  const dados = locacaoSchema.parse(row.dados)
  return {
    versao: row.versao,
    locacao: {
      ...dados,
      id: row.id,
      corretorId: row.corretor_id ?? dados.corretorId,
      imovelId: row.imovel_id ?? dados.imovelId,
      status: row.status as Locacao['status'],
      etapa: row.etapa,
      arquivado: row.arquivado,
    },
  }
}

/**
 * `tenantId` entra por parâmetro e nunca de `locacao`: o agregado do domínio não
 * conhece tenant, e é assim que o tenant não pode vir do corpo da requisição.
 * Corretor e imóvel só viram coluna se forem uuid reais (a FK exige); o valor do
 * domínio continua em `dados`.
 */
export function toLocacaoRow(locacao: Locacao, tenantId: string): Omit<GestaoLocacaoRow, 'versao' | 'updated_at'> {
  const dados = locacaoSchema.parse(locacao)
  return {
    tenant_id: tenantId,
    id: locacao.id,
    corretor_id: ehUuid(locacao.corretorId) ? locacao.corretorId : null,
    imovel_id: ehUuid(locacao.imovelId) ? locacao.imovelId : null,
    status: locacao.status,
    arquivado: locacao.arquivado,
    etapa: locacao.etapa,
    dados,
  }
}

export type ContratoSemValores = Omit<ContratoLocacao, 'valor' | 'taxaPct'>
export type CobrancaSemValores = Omit<Cobranca, 'valor' | 'repasse' | 'pago' | 'pagamentos'> & {
  /** só se foi paga e quando: o comprovante e o valor ficam com quem vê valores */
  pago?: { data: string }
  repasseFeito?: boolean
}
export type LocacaoSemValores = Omit<Locacao, 'contrato' | 'cobrancas'> & {
  contrato?: ContratoSemValores
  cobrancas: CobrancaSemValores[]
}

/**
 * O que um perfil SEM `valores` pode ver. É recorte por allowlist, e não
 * `delete valor`: um campo financeiro que o domínio ganhe amanhã nasce escondido
 * em vez de vazar. Fica o que a recepção precisa — datas do contrato (para o
 * aviso de fim), competência/vencimento/pago (para o aviso de aluguel) — sem
 * valor, taxa, repasse nem comprovante. O `repasse` some inteiro; o `repasseFeito`
 * é só um booleano para a tela não mostrar «repasse pendente» a quem não pode agir.
 */
export function semValores(l: Locacao): LocacaoSemValores {
  const { contrato, cobrancas, ...resto } = l
  return {
    ...resto,
    ...(contrato && { contrato: { diaVencimento: contrato.diaVencimento, inicio: contrato.inicio, fim: contrato.fim, reajuste: contrato.reajuste } }),
    cobrancas: cobrancas.map((c) => ({
      id: c.id,
      competencia: c.competencia,
      vencimento: c.vencimento,
      ...(c.pago && { pago: { data: c.pago.data } }),
      ...(c.repasse && { repasseFeito: c.repasse.feito }),
    })),
  }
}

export function paraPerfil(l: Locacao, verValores: boolean): Locacao | LocacaoSemValores {
  return verValores ? l : semValores(l)
}

