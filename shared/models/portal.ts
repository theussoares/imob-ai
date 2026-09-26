import type { FireInsurancePayer, GuaranteeType } from '~~/shared/models/lease'

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

/** Como cada papel é escrito na tela, para a imobiliária e para o cliente. */
export const CONTRACT_PARTY_LABELS: Record<ContractPartyRole, string> = {
  inquilino: 'inquilino',
  proprietario: 'proprietário',
  fiador: 'fiador',
}

export type ContractStatus = 'ativo' | 'encerrado'

export type PortalDocCategory =
  | 'contrato'
  | 'contrato_administracao'
  | 'vistoria'
  | 'boleto'
  | 'recibo'
  | 'extrato'
  | 'outro'

export const PORTAL_DOC_CATEGORIES: readonly PortalDocCategory[] = [
  'contrato',
  'contrato_administracao',
  'vistoria',
  'boleto',
  'recibo',
  'extrato',
  'outro',
]

/** Rótulos de tela, no vocabulário que a imobiliária usa com o cliente. */
export const PORTAL_DOC_LABELS: Record<PortalDocCategory, string> = {
  contrato: 'Contrato de locação',
  contrato_administracao: 'Contrato de administração',
  vistoria: 'Vistoria',
  boleto: 'Boleto',
  recibo: 'Recibo',
  extrato: 'Extrato de repasse',
  outro: 'Outro documento',
}

/**
 * O que vai em cada categoria, escrito para quem SOBE o documento.
 *
 * Existe porque quem classifica o documento é a imobiliária, e a classificação
 * decide quem enxerga. A responsabilidade pelo acerto é de quem sobe — e é
 * justamente por isso que a tela precisa dizer, no momento da escolha, o que
 * vai ali e quem vai ver. Regra que só existe na cabeça de quem escreveu o
 * código não é regra: é armadilha.
 *
 * A frase de "quem vê" NÃO mora aqui. Ela é derivada de `defaultAudienceFor`
 * por `describeAudience`, para que rótulo e comportamento não possam divergir —
 * o dia em que a audiência de uma categoria mudar e o texto continuar o antigo
 * é o dia em que a tela mente para quem confiou nela.
 */
export const PORTAL_DOC_HINTS: Record<PortalDocCategory, string> = {
  contrato: 'O contrato de locação assinado pelas duas pontas.',
  contrato_administracao:
    'O contrato entre a imobiliária e o dono do imóvel. Traz taxa de administração e dados bancários do proprietário — o inquilino não é parte dele.',
  vistoria: 'O laudo de vistoria do imóvel (entrada ou saída).',
  boleto: 'O boleto do aluguel do mês.',
  recibo: 'O comprovante de pagamento do aluguel — hoje, o Pix.',
  extrato: 'O extrato de repasse ao proprietário, com a taxa de administração descontada.',
  outro: 'Qualquer outro documento do contrato — apólice de seguro, notificação, aditivo.',
}

/** Cliente da imobiliária com acesso ao portal. */
export interface PortalUser {
  id: string
  tenantId: string
  /**
   * Conta no Auth. Nulo = cliente SEM acesso ao portal: cadastro da
   * imobiliária (o fiador que nunca vai entrar, o dono que só usa WhatsApp).
   * Ver 0050.
   */
  userId: string | null
  name: string
  /** Opcional para quem não tem acesso; obrigatório para quem tem. */
  email: string | null
  /** CPF/CNPJ. Uso interno da imobiliária — nunca vai para a resposta do portal. */
  doc: string | null
  phone: string | null
  active: boolean
  /**
   * A pessoa já entrou no portal por este vínculo (ou a conta nasceu do nosso
   * convite). Decide se "Reenviar convite" gera link de senha — ver a nota em
   * `convidarClientePortal`. Aqui só serve para a tela dizer o estado.
   */
  accessConfirmed: boolean
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
  /** Prazo combinado em meses (o término fica em `endsOn`). */
  termMonths: number | null
  /** UMA garantia (Lei 8.245, art. 37). Nulo = não informada ainda. */
  guaranteeType: GuaranteeType | null
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
  /** Caução em dinheiro (até 3 aluguéis) ou valor da garantia. */
  guaranteeAmount: number | null
  /** Seguradora, apólice, validade. */
  guaranteeDetails: string | null
  fireInsurancePayer: FireInsurancePayer | null
  finePercent: number | null
  interestMonthlyPercent: number | null
  /** Taxa de locação, em % do primeiro aluguel. */
  rentFeePercent: number | null
  /** Repasse ao proprietário, em dias úteis após o pagamento. */
  payoutBusinessDays: number | null
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
  termMonths?: number | null
  guaranteeType?: GuaranteeType | null
}

/** Campos internos, editados na mesma tela mas gravados em outra tabela. */
export interface ContractInternalInput {
  notes?: string | null
  adminFeePercent?: number | null
  externalId?: string | null
  guaranteeAmount?: number | null
  guaranteeDetails?: string | null
  fireInsurancePayer?: FireInsurancePayer | null
  finePercent?: number | null
  interestMonthlyPercent?: number | null
  rentFeePercent?: number | null
  payoutBusinessDays?: number | null
}

/**
 * Cadastro de um cliente pelo painel.
 *
 * `convidar` separa CADASTRAR de DAR ACESSO: sem ele (ou falso) a pessoa
 * existe só para a imobiliária. Com ele, o e-mail vira obrigatório e o convite
 * da Área do Cliente sai pelo caminho de sempre.
 */
export interface PortalUserInput {
  name: string
  email?: string | null
  doc?: string | null
  phone?: string | null
  convidar?: boolean
}


/**
 * Publicação de um documento pelo painel.
 *
 * `storagePath` chega do navegador porque o upload vai direto ao Storage (as
 * policies da 0028 autorizam pela pasta do slug). O servidor NÃO confia nele —
 * ver `assertCaminhoDoTenant` em `portal-document.repository.ts`.
 */
export interface PortalDocumentInput {
  contractId: string
  category: PortalDocCategory
  title: string
  /** Mês de referência, gravado no dia 1. */
  competence?: string | null
  dueOn?: string | null
  amount?: number | null
  storagePath: string
  mime?: string | null
  sizeBytes?: number | null
  /** Omitido = o default seguro da categoria (`defaultAudienceFor`). */
  audience?: ContractPartyRole[]
}
