/**
 * Cobrança do aluguel (boleto + Pix) e repasse ao proprietário.
 *
 * Modelos sobre as tabelas da 0041/0042/0051. As regras de negócio (spec 25/09,
 * B3) moram aqui, em funções puras, porque errar qualquer uma delas cobra ou
 * repassa o valor errado — e isso precisa de teste sem banco nem rede.
 */

export type ChargeKind = 'mensal' | 'avulsa'

export type ChargeItemKind = 'aluguel' | 'condominio' | 'iptu' | 'seguro' | 'multa' | 'juros' | 'desconto' | 'outros'

export const CHARGE_ITEM_KINDS: ChargeItemKind[] = [
  'aluguel',
  'condominio',
  'iptu',
  'seguro',
  'multa',
  'juros',
  'desconto',
  'outros',
]

export const CHARGE_ITEM_LABELS: Record<ChargeItemKind, string> = {
  aluguel: 'Aluguel',
  condominio: 'Condomínio',
  iptu: 'IPTU',
  seguro: 'Seguro incêndio',
  multa: 'Multa',
  juros: 'Juros',
  desconto: 'Desconto',
  outros: 'Outros',
}

/** Itens que a tela oferece no lançamento. Multa e juros vêm do boleto, não da mão. */
export const CHARGE_ITEM_KINDS_MANUAIS: ChargeItemKind[] = ['condominio', 'iptu', 'seguro', 'desconto', 'outros']

export type SettlementMethod = 'boleto' | 'pix' | 'transferencia' | 'dinheiro' | 'outro'

export const SETTLEMENT_METHOD_LABELS: Record<SettlementMethod, string> = {
  boleto: 'Boleto',
  pix: 'Pix',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
}

/** Baixa manual: o que o painel aceita (boleto e Pix chegam pelo provedor). */
export const MANUAL_SETTLEMENT_METHODS: SettlementMethod[] = ['pix', 'transferencia', 'dinheiro', 'outro']

export type PaymentProviderName = 'asaas' | 'simulado'
export type PaymentEnvironment = 'sandbox' | 'producao'

export const PROVIDER_LABELS: Record<PaymentProviderName, string> = {
  asaas: 'Asaas',
  simulado: 'Simulado (demonstração)',
}

/**
 * Estado DERIVADO, nunca gravado (0041): um status gravado divergiria da soma
 * das linhas na primeira correção.
 *
 * `emitindo` é a janela entre travar a cobrança e o provedor responder. Se
 * aparecer parado na tela, o provedor falhou no meio e a trava não foi desfeita.
 */
export type ChargeStatus = 'rascunho' | 'emitindo' | 'emitida' | 'vencida' | 'parcial' | 'paga' | 'cancelada'

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  rascunho: 'Rascunho',
  emitindo: 'Emitindo…',
  emitida: 'Em aberto',
  vencida: 'Vencida',
  parcial: 'Pago em parte',
  paga: 'Paga',
  cancelada: 'Cancelada',
}

export interface ChargeItem {
  id: string
  kind: ChargeItemKind
  description: string | null
  /** Assinado: desconto é negativo. */
  amount: number
}

export interface ChargeSettlement {
  id: string
  amount: number
  settledOn: string
  method: SettlementMethod
  /** Nulo = veio do provedor (webhook); preenchido = baixa manual. */
  createdBy: string | null
}

export interface Charge {
  id: string
  contractId: string
  kind: ChargeKind
  /** 1º dia do mês de OCUPAÇÃO (não do vencimento — ver 0041). */
  competence: string
  dueOn: string
  items: ChargeItem[]
  /** Soma corrente dos itens. */
  total: number
  /** Congelado na emissão; nulo em rascunho. */
  issuedAmount: number | null
  issuedAt: string | null
  settlements: ChargeSettlement[]
  settledTotal: number
  status: ChargeStatus
  provider: PaymentProviderName | null
  providerEnvironment: PaymentEnvironment | null
  /** Id da cobrança no provedor. Só painel; o recorte do inquilino não leva. */
  externalId: string | null
  paymentUrl: string | null
  bankSlipUrl: string | null
  digitableLine: string | null
  pixCopyPaste: string | null
  finePercent: number | null
  interestMonthlyPercent: number | null
  canceledAt: string | null
  cancelReason: string | null
  createdAt: string
}

/** Recorte do INQUILINO: sem itens internos, sem liquidações, sem provedor. */
export interface ChargeForClient {
  id: string
  competence: string
  dueOn: string
  amount: number
  status: Exclude<ChargeStatus, 'rascunho' | 'emitindo'>
  paymentUrl: string | null
  bankSlipUrl: string | null
  digitableLine: string | null
  pixCopyPaste: string | null
}

export type PayoutStatus = 'pendente' | 'pago' | 'cancelado'

export interface OwnerPayout {
  id: string
  contractId: string
  competence: string
  scheduledFor: string | null
  paidAt: string | null
  canceledAt: string | null
  status: PayoutStatus
  /** Recebido do inquilino. */
  gross: number
  /** Taxa de administração retida (positiva aqui, negativa no item). */
  adminFee: number
  net: number
  sourceChargeId: string | null
}

export interface PaymentAccountView {
  provider: PaymentProviderName
  environment: PaymentEnvironment
  /** Só os 4 últimos caracteres — a chave nunca volta ao navegador. */
  apiKeyLast4: string | null
  accountName: string | null
  connectedAt: string
}

export interface PaymentAccountInput {
  provider: PaymentProviderName
  environment: PaymentEnvironment
  apiKey?: string
}

export interface ChargeCreateInput {
  kind?: ChargeKind
  /** YYYY-MM (mês de ocupação). */
  competence: string
  dueOn: string
  /** Aluguel do mês; padrão é o do contrato. */
  rentAmount?: number
  extras?: { kind: ChargeItemKind; description?: string | null; amount: number }[]
}

export interface ManualSettlementInput {
  amount: number
  settledOn: string
  method: SettlementMethod
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

/** Dinheiro em centavos inteiros e de volta: soma de float não fecha centavo. */
export function arred(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

export function somar(valores: number[]): number {
  return arred(valores.reduce((s, v) => s + Math.round(v * 100), 0) / 100)
}

/** `hoje` no fuso de São Paulo, YYYY-MM-DD — o vencimento é data civil local. */
export function hojeEmSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

export interface DadosDoEstado {
  canceledAt: string | null
  issuedAt: string | null
  issuedAmount: number | null
  dueOn: string
  total: number
  settledTotal: number
}

/**
 * Estado da cobrança (spec B3.4). A ordem importa:
 *   - cancelada vence tudo (um estorno depois do cancelamento não a reabre);
 *   - pago é contra o total CORRENTE, não o emitido: um desconto lançado depois
 *     da emissão reduz o que se deve;
 *   - vencida só no dia SEGUINTE ao vencimento (pagar no dia é pagar em dia).
 */
export function estadoDaCobranca(c: DadosDoEstado, hoje = hojeEmSaoPaulo()): ChargeStatus {
  if (c.canceledAt) return 'cancelada'
  if (c.issuedAmount == null) return c.issuedAt ? 'emitindo' : 'rascunho'
  if (c.settledTotal > 0 && c.settledTotal + 0.001 >= c.total) return 'paga'
  if (c.settledTotal > 0) return 'parcial'
  return c.dueOn < hoje ? 'vencida' : 'emitida'
}

function ultimoDiaDoMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate()
}

/**
 * Vencimento padrão: dia `dueDay` do mês SEGUINTE à competência.
 *
 * A Lei 8.245 tem aluguel vencido como regra (o de setembro se paga em
 * outubro); antecipado é exceção (art. 42). Dia 31 em mês de 30 cai no último
 * dia — o contrato diz "dia 31" querendo dizer "no fim do mês".
 */
export function vencimentoPadrao(competencia: string, dueDay: number): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number]
  const ano = m === 12 ? a + 1 : a
  const mes = m === 12 ? 1 : m + 1
  const dia = Math.min(dueDay, ultimoDiaDoMes(ano, mes))
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** `YYYY-MM` → `YYYY-MM-01` (a 0042 exige dia 1 no banco). */
export function competenciaParaData(yyyymm: string): string {
  return `${yyyymm.slice(0, 7)}-01`
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Dias sem expediente bancário no país: feriados nacionais fixos, mais
 * Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi, em que os
 * bancos não abrem (calendário FEBRABAN). Feriado municipal fica de fora — o
 * sistema atende várias cidades e erraria para uma delas; a tela deixa a data
 * editável.
 */
export function feriadosBancarios(ano: number): Set<string> {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(
    (md) => `${ano}-${md}`,
  )
  const p = pascoa(ano).getTime()
  const dia = 86_400_000
  const moveis = [-48, -47, -2, 60].map((n) => iso(new Date(p + n * dia)))
  return new Set([...fixos, ...moveis])
}

/** Soma `n` dias úteis bancários a uma data (YYYY-MM-DD). */
export function somarDiasUteis(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  let faltam = n
  const cache = new Map<number, Set<string>>()
  while (faltam > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const semana = d.getUTCDay()
    if (semana === 0 || semana === 6) continue
    const ano = d.getUTCFullYear()
    if (!cache.has(ano)) cache.set(ano, feriadosBancarios(ano))
    if (cache.get(ano)!.has(iso(d))) continue
    faltam--
  }
  return iso(d)
}

export interface CalculoDoRepasse {
  bruto: number
  taxaAdm: number
  liquido: number
}

/**
 * Repasse de uma cobrança paga (spec B3.8).
 *
 * A taxa de administração incide sobre o ALUGUEL (com o desconto concedido
 * nele), não sobre condomínio, IPTU ou seguro, que a imobiliária só repassa.
 * Cobrar 10% sobre o condomínio é o erro que o proprietário acha no extrato e
 * que vira reclamação no CRECI.
 *
 * Multa e juros pagos no atraso ficam no bruto, para o proprietário, e fora
 * da base da taxa: é a prática mais comum e a mais defensável. Contrato que
 * divide a multa com a imobiliária é ajuste manual no repasse.
 */
export function calcularRepasse(itens: Pick<ChargeItem, 'kind' | 'amount'>[], recebido: number, adminFeePercent: number | null): CalculoDoRepasse {
  const baseAluguel = Math.max(0, somar(itens.filter((i) => i.kind === 'aluguel' || i.kind === 'desconto').map((i) => i.amount)))
  const taxaAdm = arred((baseAluguel * (adminFeePercent ?? 0)) / 100)
  const bruto = arred(recebido)
  return { bruto, taxaAdm, liquido: arred(bruto - taxaAdm) }
}

export interface RepasseAMaior {
  chargeId: string
  competence: string
  /** Líquido transferido a mais ao proprietário, a recuperar. */
  valor: number
}

/**
 * Repasses JÁ FEITOS que ficaram maiores que o dinheiro que sobrou da
 * cobrança, porque o pagamento do inquilino foi estornado depois.
 *
 * O servidor cancela o repasse PENDENTE no estorno; o que já saiu da conta da
 * imobiliária não se desfaz por código (a transferência foi manual, B3.8), e
 * sem este aviso só aparecia no log. Derivado da comparação, e não gravado
 * como alerta no estorno: continua certo quando o inquilino paga de novo
 * (sobe o recebido, e o novo repasse ainda não saiu) e não depende de o
 * webhook ter chegado.
 *
 * A comparação é no bruto (o que o inquilino pagou) e o valor volta ao
 * líquido pela proporção dos próprios repasses — a taxa de administração não
 * chega à tela, e o que o proprietário recebeu a mais é o líquido.
 */
export function repassesAMaior(
  cobrancas: Pick<Charge, 'id' | 'competence' | 'settledTotal'>[],
  repasses: Pick<OwnerPayout, 'status' | 'gross' | 'net' | 'sourceChargeId'>[],
): RepasseAMaior[] {
  const r: RepasseAMaior[] = []
  for (const c of cobrancas) {
    const feitos = repasses.filter((p) => p.status === 'pago' && p.sourceChargeId === c.id)
    const bruto = somar(feitos.map((p) => p.gross))
    const excesso = arred(bruto - Math.max(0, c.settledTotal))
    if (excesso <= 0 || bruto <= 0) continue
    r.push({ chargeId: c.id, competence: c.competence, valor: arred((excesso * somar(feitos.map((p) => p.net))) / bruto) })
  }
  return r
}

/** O que falta para emitir — reusa a mesma linguagem das pendências do contrato. */
export function impedimentosDeEmissao(d: {
  status: ChargeStatus
  total: number
  inquilinoTemDocumento: boolean
  contaConfigurada: boolean
}): string[] {
  const r: string[] = []
  if (d.status !== 'rascunho') r.push('Só rascunho pode ser emitido.')
  if (d.total <= 0) r.push('O total da cobrança precisa ser maior que zero.')
  if (!d.inquilinoTemDocumento) r.push('Informe o CPF/CNPJ do inquilino: o boleto exige.')
  if (!d.contaConfigurada) r.push('Conecte a conta de cobrança em Configurações → Cobrança.')
  return r
}

/**
 * O Asaas recusa boleto com valor abaixo de R$ 5,00. Conferido aqui para a
 * mensagem sair em português, antes da rede.
 */
export const VALOR_MINIMO_BOLETO = 5
