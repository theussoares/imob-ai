/**
 * Modelos da Área do Cliente.
 *
 * O usuário do portal (inquilino/proprietário) é um tipo de gente DIFERENTE do
 * membro do painel (`shared/models/member.ts`). Os dois logam no mesmo Supabase
 * Auth, e é só isso que têm em comum: nenhum código deve tratar um como o outro.
 */

/** Papel de alguém DENTRO de um contrato — não é atributo da pessoa. */
export type ContractPartyRole = 'inquilino' | 'proprietario' | 'fiador'

export const CONTRACT_PARTY_ROLES: readonly ContractPartyRole[] = [
  'inquilino',
  'proprietario',
  'fiador',
]

export type ContractStatus = 'ativo' | 'encerrado'

export type PortalDocCategory = 'contrato' | 'vistoria' | 'boleto' | 'recibo' | 'extrato' | 'outro'

export const PORTAL_DOC_CATEGORIES: readonly PortalDocCategory[] = [
  'contrato',
  'vistoria',
  'boleto',
  'recibo',
  'extrato',
  'outro',
]

/** Rótulos de tela, no vocabulário que a imobiliária usa com o cliente. */
export const PORTAL_DOC_LABELS: Record<PortalDocCategory, string> = {
  contrato: 'Contrato',
  vistoria: 'Vistoria',
  boleto: 'Boleto',
  recibo: 'Recibo',
  extrato: 'Extrato de repasse',
  outro: 'Outro documento',
}

/** Cliente da imobiliária com acesso ao portal. */
export interface PortalUser {
  id: string
  tenantId: string
  userId: string
  name: string
  email: string
  /** CPF/CNPJ. Uso interno da imobiliária — nunca vai para a resposta do portal. */
  doc: string | null
  phone: string | null
  active: boolean
  createdAt: string
}

/** Contrato de locação, como o painel o enxerga (inclui campo interno). */
export interface Contract {
  id: string
  tenantId: string
  code: string
  propertyId: string | null
  /** Endereço escrito à mão, quando o imóvel não está no catálogo. */
  addressLabel: string | null
  status: ContractStatus
  startedOn: string | null
  endsOn: string | null
  rentAmount: number | null
  /** Dia do vencimento (1–31). Base do agendamento da cobrança. */
  dueDay: number | null
  /** Índice do reajuste anual (igpm, ipca, incc…). */
  adjustmentIndex: string | null
  source: 'manual' | 'erp'
  createdAt: string
}

/**
 * O que é da imobiliária e nunca do cliente.
 *
 * Tabela separada (`contract_internal`), não colunas escondidas dentro de
 * `contracts`. A RLS sozinha decide quem lê — sem privilégio por coluna, e
 * portanto sem a armadilha do `select('*')` que já mordeu este repositório em
 * `properties`. Ver a nota na migration 0028.
 */
export interface ContractInternal {
  contractId: string
  notes: string | null
  /** Percentual retido pela imobiliária. Margem comercial. */
  adminFeePercent: number | null
  /** Id do contrato no ERP, quando a integração existir. */
  externalId: string | null
}

/**
 * O mesmo contrato, como o CLIENTE o enxerga.
 *
 * Tipo separado de propósito, mesmo agora que os campos internos moram em outra
 * tabela: `ContractForClient` também omite `tenantId`, `propertyId` e `source`,
 * que são detalhe de implementação e não dizem nada a um inquilino.
 */
export interface ContractForClient {
  id: string
  code: string
  addressLabel: string | null
  status: ContractStatus
  startedOn: string | null
  endsOn: string | null
  rentAmount: number | null
  dueDay: number | null
  /** Papéis que ESTE cliente tem neste contrato (pode ser mais de um). */
  roles: ContractPartyRole[]
}

/** Documento publicado para o cliente. */
export interface PortalDocument {
  id: string
  contractId: string
  category: PortalDocCategory
  title: string
  /** Mês de referência (boleto/extrato), no dia 1. */
  competence: string | null
  dueOn: string | null
  amount: number | null
  mime: string | null
  sizeBytes: number | null
  audience: ContractPartyRole[]
  /** Nulo enquanto rascunho: existe no bucket, invisível no portal. */
  publishedAt: string | null
  createdAt: string
}

/** Cadastro/edição de contrato pelo painel. */
export interface ContractInput {
  code: string
  propertyId?: string | null
  addressLabel?: string | null
  status?: ContractStatus
  startedOn?: string | null
  endsOn?: string | null
  rentAmount?: number | null
  dueDay?: number | null
  adjustmentIndex?: string | null
}

/** Campos internos, editados na mesma tela mas gravados em outra tabela. */
export interface ContractInternalInput {
  notes?: string | null
  adminFeePercent?: number | null
  externalId?: string | null
}

/** Cadastro de um cliente no portal (dispara o convite por e-mail). */
export interface PortalUserInput {
  name: string
  email: string
  doc?: string | null
  phone?: string | null
}
