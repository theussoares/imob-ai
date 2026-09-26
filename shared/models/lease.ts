/**
 * Locação: o que o contrato precisa além das datas e do valor.
 * Cada lista e cada limite aqui tem base legal ou de mercado registrada em
 * docs/superpowers/specs/2026-09-25-crm-e-cobranca-design.md, seção 4B.
 */

/**
 * UMA garantia por contrato — exigir mais de uma é nulo (Lei 8.245, art. 37,
 * parágrafo único). Por isso é um valor, não uma lista.
 */
export type GuaranteeType =
  | 'nenhuma'
  | 'fiador'
  | 'caucao'
  | 'seguro_fianca'
  | 'titulo_capitalizacao'
  | 'garantia_empresa'

export const GUARANTEE_TYPES: GuaranteeType[] = [
  'fiador',
  'caucao',
  'seguro_fianca',
  'titulo_capitalizacao',
  'garantia_empresa',
  'nenhuma',
]

export const GUARANTEE_LABELS: Record<GuaranteeType, string> = {
  nenhuma: 'Sem garantia',
  fiador: 'Fiador',
  caucao: 'Caução',
  seguro_fianca: 'Seguro-fiança',
  titulo_capitalizacao: 'Título de capitalização',
  garantia_empresa: 'Garantia de empresa (ex.: CredPago)',
}

export const GUARANTEE_HINTS: Record<GuaranteeType, string> = {
  nenhuma: 'O contrato fica sem garantia. Comum em aluguel com pagamento antecipado.',
  fiador: 'Uma pessoa responde pela dívida do inquilino. Cadastre o fiador como parte do contrato.',
  caucao: 'Depósito de até 3 aluguéis, guardado em poupança e devolvido com o rendimento no fim (Lei 8.245, art. 38).',
  seguro_fianca: 'Apólice que paga o aluguel se o inquilino atrasar. Informe a seguradora e o número da apólice.',
  titulo_capitalizacao: 'O inquilino compra um título; o valor fica como garantia e volta a ele no fim.',
  garantia_empresa: 'Empresa que aprova o inquilino e garante o pagamento, cobrando uma taxa dele.',
}

/** Caução em dinheiro: até 3 aluguéis (Lei 8.245, art. 38, §2º). */
export const MAX_CAUCAO_ALUGUEIS = 3

/**
 * Índices de reajuste. Anual, sempre: reajuste com periodicidade menor é nulo
 * (Lei 10.192/2001) — por isso não existe campo de periodicidade.
 * Gravados pelo rótulo: é o que o contrato em papel diz.
 */
export const ADJUSTMENT_INDICES = ['IGP-M', 'IPCA', 'INPC', 'IVAR'] as const

/**
 * Quem paga o seguro contra incêndio. Obrigação do LOCADOR salvo cláusula em
 * contrário (Lei 8.245, art. 22, VIII) — daí o padrão.
 */
export type FireInsurancePayer = 'locador' | 'locatario' | 'nao_contratado'

export const FIRE_INSURANCE_LABELS: Record<FireInsurancePayer, string> = {
  locador: 'Proprietário paga',
  locatario: 'Inquilino paga (cláusula no contrato)',
  nao_contratado: 'Ainda não contratado',
}

/**
 * Padrões de mercado, editáveis por contrato.
 *   - taxa de administração: CRECI indica 8–10%; mercado vai de 5 a 12%;
 *   - taxa de locação: o 1º aluguel inteiro é a prática mais comum;
 *   - repasse: 3–7 dias úteis; sem cláusula, 5 é o que a jurisprudência aceita;
 *   - multa: 10% é o teto aceito na locação (que não segue o CDC); juros 1% a.m.
 */
export const LEASE_DEFAULTS = {
  adminFeePercent: 10,
  rentFeePercent: 100,
  payoutBusinessDays: 5,
  finePercent: 10,
  interestMonthlyPercent: 1,
  termMonths: 30,
  fireInsurancePayer: 'locador' as FireInsurancePayer,
} as const

export const MAX_FINE_PERCENT = 10
export const MAX_INTEREST_MONTHLY_PERCENT = 1

/**
 * Último dia do contrato: início + prazo − 1 dia. Contrato de 12 meses que
 * começa em 01/03 termina em 28/02 (ou 29), não em 01/03 do ano seguinte.
 * Datas como 'AAAA-MM-DD', sem fuso: é data de calendário, não instante.
 */
export function fimDoPrazo(inicio: string, meses: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inicio)
  if (!m || !Number.isInteger(meses) || meses < 1) return null
  const ano = Number(m[1]), mes = Number(m[2]) - 1, dia = Number(m[3])
  const alvoMes = mes + meses
  // Mesmo dia, `meses` depois; se o dia não existe no mês de destino (31/01 +
  // 1 mês), vale o último dia dele. O fim é a véspera dessa data.
  const ultimoDiaDoAlvo = new Date(Date.UTC(ano, alvoMes + 1, 0)).getUTCDate()
  const fim = new Date(Date.UTC(ano, alvoMes, Math.min(dia, ultimoDiaDoAlvo)))
  fim.setUTCDate(fim.getUTCDate() - 1)
  return fim.toISOString().slice(0, 10)
}

/** O que falta para o contrato poder ser cobrado e repassado. */
export interface Pendencia {
  codigo:
    | 'sem_inquilino'
    | 'inquilino_sem_documento'
    | 'sem_proprietario'
    | 'sem_multa_juros'
    | 'sem_garantia'
    | 'sem_repasse'
    | 'sem_taxa_adm'
    | 'sem_vencimento'
  texto: string
  /** Impede emitir boleto (frente B). As outras são só aviso. */
  bloqueiaCobranca: boolean
}

export interface DadosParaPendencias {
  rentAmount: number | null
  dueDay: number | null
  guaranteeType: GuaranteeType | null
  finePercent: number | null
  interestMonthlyPercent: number | null
  adminFeePercent: number | null
  inquilinos: { doc: string | null }[]
  proprietarios: { temDestinoDeRepasse: boolean }[]
}

export function pendenciasDoContrato(d: DadosParaPendencias): Pendencia[] {
  const p: Pendencia[] = []
  if (!d.inquilinos.length) p.push({ codigo: 'sem_inquilino', texto: 'Sem inquilino vinculado.', bloqueiaCobranca: true })
  else if (d.inquilinos.every((i) => !i.doc)) {
    p.push({ codigo: 'inquilino_sem_documento', texto: 'Inquilino sem CPF/CNPJ: o boleto exige.', bloqueiaCobranca: true })
  } else if (d.inquilinos.some((i) => !i.doc)) {
    // O boleto sai no nome de UM inquilino (`pagadorDoContrato`), e basta o
    // documento dele. Este aviso dizia "impede o boleto" com um segundo
    // inquilino sem CPF, e o boleto era emitido normalmente — a tela mentia.
    p.push({
      codigo: 'inquilino_sem_documento',
      texto: 'Um dos inquilinos está sem CPF/CNPJ. O boleto sai no nome de quem tem.',
      bloqueiaCobranca: false,
    })
  }
  if (!d.rentAmount || !d.dueDay) {
    p.push({ codigo: 'sem_vencimento', texto: 'Falta o valor do aluguel ou o dia do vencimento.', bloqueiaCobranca: true })
  }
  if (d.finePercent == null || d.interestMonthlyPercent == null) {
    p.push({ codigo: 'sem_multa_juros', texto: 'Multa e juros não informados: o boleto sairia sem eles.', bloqueiaCobranca: false })
  }
  if (!d.proprietarios.length) {
    p.push({ codigo: 'sem_proprietario', texto: 'Sem proprietário vinculado.', bloqueiaCobranca: false })
  } else if (!d.proprietarios.some((o) => o.temDestinoDeRepasse)) {
    p.push({ codigo: 'sem_repasse', texto: 'Sem Pix ou conta do proprietário para o repasse.', bloqueiaCobranca: false })
  }
  if (d.adminFeePercent == null) {
    p.push({ codigo: 'sem_taxa_adm', texto: 'Taxa de administração não informada.', bloqueiaCobranca: false })
  }
  if (!d.guaranteeType) p.push({ codigo: 'sem_garantia', texto: 'Garantia não informada.', bloqueiaCobranca: false })
  return p
}

/**
 * Em nome de quem o boleto sai: o primeiro inquilino COM documento, porque o
 * boleto registrado exige CPF/CNPJ do pagador. Sem nenhum com documento, o
 * primeiro — e a emissão recusa com a mesma mensagem da pendência.
 *
 * Uma função só para a pendência da ficha e para a emissão: eram duas regras
 * (a ficha olhava "algum sem CPF", a emissão olhava "o primeiro"), e elas
 * discordavam justamente no caso de dois inquilinos.
 */
export function pagadorDoContrato<T extends { doc: string | null }>(inquilinos: readonly T[]): T | null {
  return inquilinos.find((i) => !!i.doc) ?? inquilinos[0] ?? null
}

/** Pessoa do contrato: uma que já existe, ou uma nova criada no mesmo passo. */
export type PessoaDoContrato =
  | { id: string }
  | { nova: { name: string; phone?: string | null; email?: string | null; doc?: string | null } }

export type PayoutDestinationInput =
  | { kind: 'pix'; pixKeyType: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'; pixKey: string; holderName: string; holderDoc: string }
  | {
      kind: 'conta_bancaria'
      bankCode: string
      branch: string
      account: string
      accountDigit?: string | null
      accountType: 'corrente' | 'poupanca' | 'pagamento'
      holderName: string
      holderDoc: string
    }

/**
 * O contrato inteiro, como o assistente de 4 etapas envia.
 *
 * Obrigatório só o que a locação não existe sem: imóvel (ou endereço),
 * inquilino, aluguel, vencimento e início. O resto vira pendência na ficha
 * (`pendenciasDoContrato`), como o Kenlo faz — contrato antigo sendo migrado
 * raramente tem tudo à mão.
 */
export interface LeaseCreateInput {
  code?: string | null
  propertyId?: string | null
  addressLabel?: string | null
  /** Muda o imóvel para "Alugado" no site. Padrão da tela: marcado. */
  marcarImovelAlugado?: boolean
  inquilino: PessoaDoContrato
  proprietario?: PessoaDoContrato | null
  fiador?: PessoaDoContrato | null
  rentAmount: number
  dueDay: number
  startedOn: string
  termMonths?: number | null
  adjustmentIndex?: string | null
  guaranteeType?: GuaranteeType | null
  guaranteeAmount?: number | null
  guaranteeDetails?: string | null
  fireInsurancePayer?: FireInsurancePayer | null
  finePercent?: number | null
  interestMonthlyPercent?: number | null
  adminFeePercent?: number | null
  rentFeePercent?: number | null
  payoutBusinessDays?: number | null
  /** Destino do repasse do proprietário. Só com proprietário. */
  repasse?: PayoutDestinationInput | null
  /** Manda o convite da Área do Cliente a quem tiver e-mail e ainda não tiver acesso. */
  convidarPartes?: boolean
}

/** O que a checagem de sobreposição precisa de cada contrato. */
export interface VigenciaDoContrato {
  id: string
  code: string
  propertyId: string | null
  status: 'ativo' | 'encerrado'
  startedOn: string | null
  endsOn: string | null
}

/**
 * Contrato ATIVO do mesmo imóvel cuja vigência cruza a informada.
 *
 * Existe porque o assistente aceitou criar o LOC-2026-003 no NC-0267 com o
 * LOC-2026-001 ativo no mesmo período: a tela só mostrava "já alugado" e o
 * servidor não conferia nada. Dois contratos ativos no mesmo imóvel viram duas
 * cobranças de aluguel e dois repasses ao mesmo proprietário.
 *
 * Por que não o `status = 'rented'` do imóvel: ele é vitrine (tira o imóvel da
 * lista do site) e a imobiliária troca à mão — imóvel alugado fora do sistema
 * existe, e contrato ativo com o imóvel ainda "Publicado" também.
 *
 * Datas faltando valem como aberto naquele lado: contrato sem fim ocupa o
 * imóvel indefinidamente, que é o lado seguro de errar. Comparação de string
 * funciona porque as datas são 'AAAA-MM-DD'.
 */
export function contratoQueOcupa(
  contratos: readonly VigenciaDoContrato[],
  alvo: { propertyId?: string | null; startedOn?: string | null; endsOn?: string | null; excetoId?: string },
): VigenciaDoContrato | null {
  if (!alvo.propertyId) return null
  return (
    contratos.find(
      (c) =>
        c.id !== alvo.excetoId &&
        c.propertyId === alvo.propertyId &&
        c.status === 'ativo' &&
        (!alvo.endsOn || !c.startedOn || c.startedOn <= alvo.endsOn) &&
        (!alvo.startedOn || !c.endsOn || c.endsOn >= alvo.startedOn),
    ) ?? null
  )
}
