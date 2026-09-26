import { HEADER_STYLES, SITE_THEMES } from '~~/shared/models/site-theme'
import type { PropertyInput, PropertyPurpose } from '~~/shared/models/property'
import { areaRangeError, priceRangeError, roomsRangeError } from '~~/shared/utils/property-limits'
import type { TenantSettingsInput } from '~~/shared/models/tenant'
import type { BrokerInput } from '~~/shared/models/broker'
import type { LeadCreateInput, LeadStage, LeadType, LeadUpdateInput } from '~~/shared/models/lead'
import { ALL_LEAD_STAGES, LEAD_TYPES, toLeadLostReason } from '~~/shared/models/lead'
import type {
  LeadEventInput,
  LeadManualEventKind,
  LeadTaskInput,
  LeadTaskKind,
  LeadTaskUpdateInput,
} from '~~/shared/models/lead-activity'
import { LEAD_MANUAL_EVENT_KINDS, LEAD_TASK_KINDS } from '~~/shared/models/lead-activity'
import { assertMaxLength } from '~~/server/utils/rate-limit'
import type { GuaranteeType, LeaseCreateInput, PayoutDestinationInput } from '~~/shared/models/lease'
import {
  GUARANTEE_TYPES,
  MAX_CAUCAO_ALUGUEIS,
  MAX_FINE_PERCENT,
  MAX_INTEREST_MONTHLY_PERCENT,
} from '~~/shared/models/lease'
import { tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import { ROTULO_CHAVE_PIX, chavePixValida, type TipoChavePix } from '~~/shared/utils/pix'
import { isValidWhatsapp } from '~~/shared/utils/phone'
import { dentroDoBrasil } from '~~/shared/utils/address'
import { isHexColor } from '~~/shared/utils/brand-color'
import { PROPERTY_TYPES } from '~~/shared/models/property-type'
import { AI_TONES } from '~~/shared/models/ai-tone'
import type {
  ContractInput,
  ContractInternalInput,
  PortalDocumentInput,
  PortalUserInput,
} from '~~/shared/models/portal'
import { CONTRACT_PARTY_ROLES, PORTAL_DOC_CATEGORIES } from '~~/shared/models/portal'
import { ehUuid } from '~~/shared/utils/uuid'
import type {
  ChargeCreateInput,
  ChargeItemKind,
  ManualSettlementInput,
  PaymentAccountInput,
  SettlementMethod,
} from '~~/shared/models/cobranca'
import { CHARGE_ITEM_KINDS_MANUAIS, CHARGE_ITEM_LABELS, MANUAL_SETTLEMENT_METHODS } from '~~/shared/models/cobranca'

// Derivado do registro: tipo novo passa a ser aceito sem tocar aqui.
const TYPES = PROPERTY_TYPES as readonly string[]
const PURPOSES = ['venda', 'aluguel']
const STATUSES = ['active', 'draft', 'sold', 'rented']
const HERO_POSITIONS = ['left', 'right', 'background']

/** Valida o payload de configurações do tenant vindo do painel. */
export function assertTenantSettingsInput(input: unknown): asserts input is TenantSettingsInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const t = input as Record<string, unknown>

  // O href do CTA vira <a href> no site público: sem esta guarda, um membro do
  // tenant poderia salvar `javascript:...` e executar script na origem do site
  // para todo visitante que clicasse no botão do hero.
  const href = t.heroCtaHref
  if (href !== undefined && href !== null && String(href).trim()) {
    if (!/^(\/|https?:\/\/)/i.test(String(href).trim())) {
      throw createError({
        statusCode: 422,
        statusMessage: 'O link do botão deve começar com / ou com http(s)://',
      })
    }
  }

  if (t.portalEnabled !== undefined && typeof t.portalEnabled !== 'boolean') {
    throw createError({ statusCode: 422, statusMessage: 'Valor inválido para a Área do Cliente.' })
  }

  if (t.aboutEnabled !== undefined && typeof t.aboutEnabled !== 'boolean') {
    throw createError({ statusCode: 422, statusMessage: 'Valor inválido para a página Quem somos.' })
  }

  // Não é a barreira — `tenants` aceita UPDATE direto pelo PostgREST, e quem
  // protege o CSS é `temaCss` na leitura. Isto é para o painel recusar com uma
  // mensagem, em vez de salvar um valor que o site ignora sem avisar ninguém.
  //
  // A mensagem nomeia o campo: a tela manda as três cores a cada salvamento, e
  // um valor antigo inválido (havia um `VD001` em produção) passa a barrar o
  // salvamento de QUALQUER campo dela até ser corrigido.
  const rotulos = { brandPrimary: 'Cor principal', brandAccent: 'Cor de destaque' } as const
  for (const field of ['brandPrimary', 'brandAccent'] as const) {
    if (t[field] !== undefined && !isHexColor(t[field])) {
      throw createError({ statusCode: 422, statusMessage: `${rotulos[field]} inválida. Use o formato #RRGGBB.` })
    }
  }
  const wa = t.whatsappButtonColor
  if (wa !== undefined && wa !== null && wa !== '' && !isHexColor(wa)) {
    throw createError({ statusCode: 422, statusMessage: 'Cor do botão de WhatsApp inválida. Use o formato #RRGGBB.' })
  }

  if (t.heroImagePosition !== undefined && !HERO_POSITIONS.includes(t.heroImagePosition as string)) {
    throw createError({ statusCode: 422, statusMessage: 'Posição da imagem do hero inválida.' })
  }
  if (t.siteTheme !== undefined && !(SITE_THEMES as readonly string[]).includes(t.siteTheme as string)) {
    throw createError({ statusCode: 422, statusMessage: 'Tema do site inválido.' })
  }
  if (t.headerStyle !== undefined && !(HEADER_STYLES as readonly string[]).includes(t.headerStyle as string)) {
    throw createError({ statusCode: 422, statusMessage: 'Estilo do cabeçalho inválido.' })
  }

  // WhatsApp/telefone alimentam links wa.me/tel: — exigem DDI 55 (12–13 dígitos).
  for (const field of ['whatsapp', 'phone'] as const) {
    const v = t[field]
    if (v !== undefined && v !== null && String(v).trim() && !isValidWhatsapp(String(v))) {
      throw createError({ statusCode: 422, statusMessage: 'Número de contato inválido.' })
    }
  }

  if (t.addressZip !== undefined && t.addressZip !== null && String(t.addressZip).trim()) {
    if (!/^\d{8}$/.test(String(t.addressZip).replace(/\D/g, ''))) {
      throw createError({ statusCode: 422, statusMessage: 'CEP inválido. Use 8 dígitos.' })
    }
  }

  // Ou o pino tem os dois eixos, ou não tem pino — metade de coordenada aponta
  // para lugar nenhum e ainda assim passaria a chamar googleMapsEmbedSrc no modo
  // "por coordenada" em vez de cair no modo "por endereço".
  const hasLat = t.latitude !== undefined && t.latitude !== null
  const hasLng = t.longitude !== undefined && t.longitude !== null
  if (hasLat !== hasLng) {
    throw createError({ statusCode: 422, statusMessage: 'Informe latitude e longitude juntas, ou deixe as duas em branco.' })
  }
  if (hasLat && (typeof t.latitude !== 'number' || Number.isNaN(t.latitude) || t.latitude < -90 || t.latitude > 90)) {
    throw createError({ statusCode: 422, statusMessage: 'Latitude inválida (-90 a 90).' })
  }
  if (hasLng && (typeof t.longitude !== 'number' || Number.isNaN(t.longitude) || t.longitude < -180 || t.longitude > 180)) {
    throw createError({ statusCode: 422, statusMessage: 'Longitude inválida (-180 a 180).' })
  }
  // Coordenada válida no planeta mas fora do Brasil é quase sempre o sinal de
  // menos esquecido: todo o território tem longitude negativa, e quase todo,
  // latitude negativa. A Olmi foi gravada como 20.78, 51.68 — o pino caía no
  // Cazaquistão, e a faixa -90..90 acima deixou passar. O produto só atende
  // imobiliária brasileira (`addressCountry: "BR"` no schema.org da home).
  // Caixa com folga de ~1° sobre os extremos do território.
  if (hasLat && hasLng && !dentroDoBrasil(t.latitude as number, t.longitude as number)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Coordenadas fora do Brasil. No Brasil a longitude é sempre negativa (e a latitude quase sempre) — confira o sinal de menos.',
    })
  }

  // `tenant.put.ts` grava com o client do usuário (papel `authenticated`), não
  // com a service_role: a `check` do banco na coluna `ai_tone` é a barreira
  // real contra quem escreve direto pelo PostgREST (a tabela nunca recebeu
  // `revoke update`), mas devolveria um erro cru do Postgres em vez de uma
  // mensagem legível na tela de configurações. Esta guarda é só isso.
  if (t.aiTone !== undefined && !(AI_TONES as readonly unknown[]).includes(t.aiTone)) {
    throw createError({ statusCode: 422, statusMessage: 'Tom da descrição por IA inválido.' })
  }
}

/** Valida o payload de imóvel vindo do painel. */
export function assertPropertyInput(input: unknown): asserts input is PropertyInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const p = input as Record<string, unknown>
  if (!String(p.code ?? '').trim()) throw createError({ statusCode: 422, statusMessage: 'Código é obrigatório.' })
  if (!String(p.title ?? '').trim()) throw createError({ statusCode: 422, statusMessage: 'Título é obrigatório.' })
  if (!TYPES.includes(p.type as string)) throw createError({ statusCode: 422, statusMessage: 'Tipo inválido.' })
  if (!PURPOSES.includes(p.purpose as string)) throw createError({ statusCode: 422, statusMessage: 'Pretensão inválida.' })
  if (typeof p.price !== 'number' || Number.isNaN(p.price) || p.price < 0) {
    throw createError({ statusCode: 422, statusMessage: 'Preço inválido.' })
  }
  /*
   * Teto de plausibilidade. Sem isto, `240000000` digitado no lugar de `240000`
   * era gravado sem uma palavra e a vitrine passava a anunciar um terreno de
   * 240 m² por R$ 240 milhões. `price >= 0` sozinho não protege de nada que
   * importe. Ver shared/utils/property-limits.ts para a escolha dos números.
   */
  const precoErro = priceRangeError(p.price, p.purpose as PropertyPurpose)
  if (precoErro) throw createError({ statusCode: 422, statusMessage: precoErro })

  // Mesmo raciocínio para as medidas: em produção há um terreno com `suites:
  // 400`, que é a metragem digitada no campo de suítes.
  for (const [campo, label] of [
    ['bedrooms', 'Quartos'],
    ['suites', 'Suítes'],
    ['bathrooms', 'Banheiros'],
    ['parking', 'Vagas'],
  ] as const) {
    const v = p[campo]
    if (v === undefined || v === null) continue
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0) {
      throw createError({ statusCode: 422, statusMessage: `${label}: valor inválido.` })
    }
    const erro = roomsRangeError(v, label)
    if (erro) throw createError({ statusCode: 422, statusMessage: erro })
  }

  if (p.area !== undefined && p.area !== null) {
    if (typeof p.area !== 'number' || Number.isNaN(p.area) || p.area < 0) {
      throw createError({ statusCode: 422, statusMessage: 'Área inválida.' })
    }
    const areaErro = areaRangeError(p.area)
    if (areaErro) throw createError({ statusCode: 422, statusMessage: areaErro })
  }
  if (p.status !== undefined && !STATUSES.includes(p.status as string)) {
    throw createError({ statusCode: 422, statusMessage: 'Status inválido.' })
  }
  if (p.ownerPhone !== undefined && p.ownerPhone !== null && String(p.ownerPhone).trim() && !isValidWhatsapp(String(p.ownerPhone))) {
    throw createError({ statusCode: 422, statusMessage: 'WhatsApp do proprietário inválido.' })
  }
}

/** Um valor de data opcional precisa ser ISO parseável (ou vazio/null). */
function assertOptionalDate(v: unknown, label: string) {
  if (v === undefined || v === null || String(v).trim() === '') return
  if (Number.isNaN(new Date(String(v)).getTime())) {
    throw createError({ statusCode: 422, statusMessage: `${label} inválida.` })
  }
}

/** Valida o cadastro manual de um lead pelo painel. */
export function assertLeadCreateInput(input: unknown): asserts input is LeadCreateInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const l = input as Record<string, unknown>
  if (!String(l.name ?? '').trim()) throw createError({ statusCode: 422, statusMessage: 'Nome é obrigatório.' })
  if (l.stage !== undefined && !ALL_LEAD_STAGES.includes(l.stage as LeadStage)) {
    throw createError({ statusCode: 422, statusMessage: 'Etapa inválida.' })
  }
  if (l.leadType !== undefined && !LEAD_TYPES.includes(l.leadType as LeadType)) {
    throw createError({ statusCode: 422, statusMessage: 'Tipo de contato inválido.' })
  }
  assertOptionalDate(l.nextContactAt, 'Data de retorno')
}

/** Valida a edição de um lead (mover no funil, trocar o responsável). */
/**
 * `crm`: a imobiliária tem o CRM (0054)? As duas regras abaixo que dependem
 * dele são o contrato da tela de cada modo — sem CRM a ficha ainda edita
 * anotação e retorno direto, e não existe "marcar como perdido" com motivo.
 */
export function assertLeadUpdateInput(input: unknown, { crm }: { crm: boolean }): asserts input is LeadUpdateInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const l = input as Record<string, unknown>
  if (l.stage !== undefined && !ALL_LEAD_STAGES.includes(l.stage as LeadStage)) {
    throw createError({ statusCode: 422, statusMessage: 'Etapa inválida.' })
  }
  if (l.leadType !== undefined && !LEAD_TYPES.includes(l.leadType as LeadType)) {
    throw createError({ statusCode: 422, statusMessage: 'Tipo de contato inválido.' })
  }
  if (l.name !== undefined && l.name !== null && !String(l.name).trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Nome não pode ficar vazio.' })
  }
  if (l.lostReason !== undefined && l.lostReason !== null && !toLeadLostReason(l.lostReason)) {
    throw createError({ statusCode: 422, statusMessage: 'Motivo de perda inválido.' })
  }
  // Perder sem dizer por quê é o que tornaria o relatório de perdas inútil.
  if (crm && l.stage === 'perdido' && !toLeadLostReason(l.lostReason)) {
    throw createError({ statusCode: 422, statusMessage: 'Informe o motivo da perda.' })
  }
  // Anotação e retorno viraram linha do tempo e tarefa (0049). Recusar em vez
  // de ignorar: uma tela antiga que ainda mande estes campos acharia que
  // salvou, e a anotação sumiria calada.
  if (crm && (l.notes !== undefined || l.nextContactAt !== undefined)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Anotações e retornos agora ficam no histórico e na agenda do contato.',
    })
  }
  if (!crm) {
    if (l.notes !== undefined && l.notes !== null) assertMaxLength(String(l.notes), 4000, 'Anotações')
    assertOptionalDate(l.nextContactAt, 'Data de retorno')
  }
}

/** Registro manual na linha do tempo. */
export function assertLeadEventInput(input: unknown): asserts input is LeadEventInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const e = input as Record<string, unknown>
  if (!LEAD_MANUAL_EVENT_KINDS.includes(e.kind as LeadManualEventKind)) {
    throw createError({ statusCode: 422, statusMessage: 'Tipo de registro inválido.' })
  }
  const body = String(e.body ?? '').trim()
  if (!body) throw createError({ statusCode: 422, statusMessage: 'Escreva o que aconteceu.' })
  assertMaxLength(body, 4000, 'Registro')
  assertOptionalDate(e.occurredAt, 'Data do registro')
  // Registro no futuro seria agenda, não histórico — e empurraria o evento
  // para o topo da linha do tempo. Um minuto de folga para relógio adiantado.
  if (e.occurredAt && new Date(String(e.occurredAt)).getTime() > Date.now() + 60_000) {
    throw createError({ statusCode: 422, statusMessage: 'O registro não pode ser no futuro. Para marcar algo, crie uma tarefa.' })
  }
}

/** Tarefa nova (visita, retorno). Lead, imóvel e corretor são conferidos contra o tenant pela FK composta (0049). */
export function assertLeadTaskInput(input: unknown): asserts input is LeadTaskInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const t = input as Record<string, unknown>
  if (!LEAD_TASK_KINDS.includes(t.kind as LeadTaskKind)) {
    throw createError({ statusCode: 422, statusMessage: 'Tipo de tarefa inválido.' })
  }
  const title = String(t.title ?? '').trim()
  if (!title) throw createError({ statusCode: 422, statusMessage: 'Dê um título à tarefa.' })
  assertMaxLength(title, 200, 'Título')
  if (!t.dueAt || Number.isNaN(new Date(String(t.dueAt)).getTime())) {
    throw createError({ statusCode: 422, statusMessage: 'Data da tarefa inválida.' })
  }
  for (const [campo, rotulo] of [['leadId', 'Contato'], ['propertyId', 'Imóvel'], ['brokerId', 'Corretor']] as const) {
    const v = t[campo]
    if (v !== undefined && v !== null && v !== '' && !ehUuid(String(v))) {
      throw createError({ statusCode: 422, statusMessage: `${rotulo} inválido.` })
    }
  }
}

export function assertLeadTaskUpdateInput(input: unknown): asserts input is LeadTaskUpdateInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const t = input as Record<string, unknown>
  if (t.done && t.canceled) {
    throw createError({ statusCode: 422, statusMessage: 'A tarefa não pode ser concluída e cancelada ao mesmo tempo.' })
  }
  if (t.dueAt !== undefined && Number.isNaN(new Date(String(t.dueAt)).getTime())) {
    throw createError({ statusCode: 422, statusMessage: 'Data da tarefa inválida.' })
  }
  if (t.title !== undefined) {
    const title = String(t.title ?? '').trim()
    if (!title) throw createError({ statusCode: 422, statusMessage: 'Dê um título à tarefa.' })
    assertMaxLength(title, 200, 'Título')
  }
  if (t.brokerId !== undefined && t.brokerId !== null && t.brokerId !== '' && !ehUuid(String(t.brokerId))) {
    throw createError({ statusCode: 422, statusMessage: 'Corretor inválido.' })
  }
}

/** Valida o payload de corretor vindo do painel. */
export function assertBrokerInput(input: unknown): asserts input is BrokerInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const b = input as Record<string, unknown>
  if (!String(b.name ?? '').trim()) throw createError({ statusCode: 422, statusMessage: 'Nome é obrigatório.' })
  if (b.phone !== undefined && b.phone !== null && String(b.phone).trim() && !isValidWhatsapp(String(b.phone))) {
    throw createError({ statusCode: 422, statusMessage: 'WhatsApp/telefone do corretor inválido.' })
  }
  // Foto vem de upload para o Storage — só http(s), nunca um esquema executável
  // (mesma regra dos blocos de imagem da página "Quem somos").
  if (b.photoUrl !== undefined && b.photoUrl !== null && String(b.photoUrl).trim() && !/^https?:\/\//i.test(String(b.photoUrl).trim())) {
    throw createError({ statusCode: 422, statusMessage: 'Foto inválida.' })
  }
  if (b.bio !== undefined && b.bio !== null && String(b.bio).length > 500) {
    throw createError({ statusCode: 422, statusMessage: 'Minibio muito longa (máx. 500 caracteres).' })
  }
  if (b.receivesLeads !== undefined && typeof b.receivesLeads !== 'boolean') {
    throw createError({ statusCode: 422, statusMessage: 'Roleta: valor inválido.' })
  }
}


/** Valida o payload de contrato vindo do painel. */
export function assertContractInput(input: unknown): asserts input is ContractInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const c = input as Record<string, unknown>

  if (!String(c.code ?? '').trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Código do contrato é obrigatório.' })
  }
  if (c.status !== undefined && !['ativo', 'encerrado'].includes(String(c.status))) {
    throw createError({ statusCode: 422, statusMessage: 'Situação do contrato inválida.' })
  }

  // O mesmo check da constraint da 0028, adiantado para virar mensagem legível
  // em vez de erro do Postgres. Dia 0 e dia 45 são digitação, e um contrato com
  // vencimento inválido só aparece no mês em que a cobrança não sai.
  if (c.dueDay !== undefined && c.dueDay !== null) {
    const dia = Number(c.dueDay)
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      throw createError({ statusCode: 422, statusMessage: 'Dia do vencimento deve ser entre 1 e 31.' })
    }
  }

  if (c.rentAmount !== undefined && c.rentAmount !== null) {
    const valor = Number(c.rentAmount)
    if (!Number.isFinite(valor) || valor < 0) {
      throw createError({ statusCode: 422, statusMessage: 'Valor do aluguel inválido.' })
    }
  }

  assertOptionalDate(c.startedOn, 'Início da locação')
  assertOptionalDate(c.endsOn, 'Fim da locação')

  // Contrato que termina antes de começar passa despercebido no cadastro e
  // reaparece como vigência negativa na tela do cliente.
  if (c.startedOn && c.endsOn && String(c.endsOn) < String(c.startedOn)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'O fim da locação não pode ser anterior ao início.',
    })
  }

  // Sem imóvel do catálogo E sem endereço escrito, o contrato não tem como ser
  // identificado na tela — nem pelo cliente, nem por quem cadastrou.
  const temImovel = c.propertyId !== undefined && c.propertyId !== null && String(c.propertyId).trim()
  const temEndereco = String(c.addressLabel ?? '').trim()
  if (!temImovel && !temEndereco) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Informe o imóvel do catálogo ou escreva o endereço do contrato.',
    })
  }
  if (temImovel && !ehUuid(String(c.propertyId))) {
    throw createError({ statusCode: 422, statusMessage: 'Imóvel inválido.' })
  }
  if (c.termMonths !== undefined && c.termMonths !== null) {
    const m = Number(c.termMonths)
    if (!Number.isInteger(m) || m < 1 || m > 600) {
      throw createError({ statusCode: 422, statusMessage: 'Prazo deve ser em meses, entre 1 e 600.' })
    }
  }
  // Uma garantia só (Lei 8.245, art. 37, parágrafo único): um valor da lista,
  // nunca uma lista de valores.
  if (c.guaranteeType !== undefined && c.guaranteeType !== null && !GUARANTEE_TYPES.includes(c.guaranteeType as GuaranteeType)) {
    throw createError({ statusCode: 422, statusMessage: 'Escolha uma garantia da lista. A lei não permite mais de uma no mesmo contrato.' })
  }
}

/** Valida o cadastro de um cliente do portal. */
export function assertPortalUserInput(input: unknown): asserts input is PortalUserInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const u = input as Record<string, unknown>

  if (!String(u.name ?? '').trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Nome é obrigatório.' })
  }

  // O e-mail é a identidade da pessoa no Auth e a chave do convite. E-mail
  // errado aqui não é campo errado: é convite entregue a outra pessoa. Sem
  // convite (cliente sem acesso, 0050) ele é opcional — mas se vier, é válido.
  const email = String(u.email ?? '').trim()
  if (u.convidar && !email) {
    throw createError({ statusCode: 422, statusMessage: 'Informe o e-mail para enviar o convite da Área do Cliente.' })
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw createError({ statusCode: 422, statusMessage: 'E-mail inválido.' })
  }

  if (u.phone !== undefined && u.phone !== null && String(u.phone).trim() && !isValidWhatsapp(String(u.phone))) {
    throw createError({ statusCode: 422, statusMessage: 'WhatsApp/telefone do cliente inválido.' })
  }
  assertDocumentoOpcional(u.doc)
}

/**
 * CPF/CNPJ, quando informado, fecha o dígito verificador: o boleto exige o
 * documento do pagador e o provedor recusa o que não fecha.
 */
function assertDocumentoOpcional(v: unknown) {
  if (v === undefined || v === null || !String(v).trim()) return
  if (!tipoDeDocumento(String(v))) {
    throw createError({ statusCode: 422, statusMessage: 'CPF/CNPJ inválido. Confira os números.' })
  }
}

/** Percentual opcional dentro de [min, max], com mensagem que diz o limite. */
function assertPercentual(v: unknown, max: number, mensagem: string) {
  if (v === undefined || v === null || v === '') return
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > max) throw createError({ statusCode: 422, statusMessage: mensagem })
}

/** Valida o público-alvo de um documento vindo do painel. */
export function assertAudience(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    // Audiência vazia grava um documento que ninguém vê — e o suporte que vem
    // depois é "publiquei e o cliente diz que não está lá".
    throw createError({ statusCode: 422, statusMessage: 'Escolha quem pode ver este documento.' })
  }
  for (const papel of value) {
    if (!CONTRACT_PARTY_ROLES.includes(papel as never)) {
      throw createError({ statusCode: 422, statusMessage: 'Público-alvo inválido.' })
    }
  }
}


/**
 * Valida os campos internos do contrato.
 *
 * `admin_fee_percent` é margem comercial da imobiliária. A constraint da 0028
 * já recusa fora de 0–100; aqui a recusa vira mensagem legível, e não erro do
 * Postgres numa tela de cadastro.
 */
export function assertContractInternalInput(input: unknown): asserts input is ContractInternalInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const i = input as Record<string, unknown>

  if (i.adminFeePercent !== undefined && i.adminFeePercent !== null) {
    const taxa = Number(i.adminFeePercent)
    if (!Number.isFinite(taxa) || taxa < 0 || taxa > 100) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Taxa de administração deve ser entre 0 e 100.',
      })
    }
  }
  // Os mesmos tetos dos CHECKs da 0050, adiantados para virar frase legível.
  assertPercentual(i.finePercent, MAX_FINE_PERCENT, `Multa por atraso: no máximo ${MAX_FINE_PERCENT}%.`)
  assertPercentual(i.interestMonthlyPercent, MAX_INTEREST_MONTHLY_PERCENT, `Juros de mora: no máximo ${MAX_INTEREST_MONTHLY_PERCENT}% ao mês.`)
  assertPercentual(i.rentFeePercent, 100, 'Taxa de locação: entre 0% e 100% do primeiro aluguel.')
  if (i.payoutBusinessDays !== undefined && i.payoutBusinessDays !== null) {
    const d = Number(i.payoutBusinessDays)
    if (!Number.isInteger(d) || d < 0 || d > 30) {
      throw createError({ statusCode: 422, statusMessage: 'Prazo de repasse: entre 0 e 30 dias úteis.' })
    }
  }
  if (i.guaranteeAmount !== undefined && i.guaranteeAmount !== null) {
    const v = Number(i.guaranteeAmount)
    if (!Number.isFinite(v) || v < 0) throw createError({ statusCode: 422, statusMessage: 'Valor da garantia inválido.' })
  }
  if (i.fireInsurancePayer !== undefined && i.fireInsurancePayer !== null && !['locador', 'locatario', 'nao_contratado'].includes(String(i.fireInsurancePayer))) {
    throw createError({ statusCode: 422, statusMessage: 'Seguro incêndio: opção inválida.' })
  }
  if (i.guaranteeDetails != null) assertMaxLength(String(i.guaranteeDetails), 1000, 'Detalhes da garantia')
}

/**
 * Caução em dinheiro até 3 aluguéis (Lei 8.245, art. 38, §2º). Função à parte
 * porque cruza dois registros: o valor mora em `contract_internal` e o aluguel
 * em `contracts`.
 */
export function assertCaucaoDentroDoLimite(guaranteeType: unknown, guaranteeAmount: unknown, rentAmount: unknown) {
  if (guaranteeType !== 'caucao' || guaranteeAmount == null || rentAmount == null) return
  const limite = Number(rentAmount) * MAX_CAUCAO_ALUGUEIS
  if (Number(guaranteeAmount) > limite + 0.001) {
    throw createError({
      statusCode: 422,
      statusMessage: `Caução acima do permitido: até ${MAX_CAUCAO_ALUGUEIS} aluguéis (Lei 8.245, art. 38).`,
    })
  }
}


/** Valida o payload de publicação de documento. */
export function assertPortalDocumentInput(input: unknown): asserts input is PortalDocumentInput {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  }
  const d = input as Record<string, unknown>

  if (!String(d.contractId ?? '').trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Contrato é obrigatório.' })
  }
  if (!String(d.title ?? '').trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Título do documento é obrigatório.' })
  }
  if (!String(d.storagePath ?? '').trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Envie o arquivo antes de salvar.' })
  }
  if (!PORTAL_DOC_CATEGORIES.includes(d.category as never)) {
    throw createError({ statusCode: 422, statusMessage: 'Categoria de documento inválida.' })
  }

  // Audiência só é validada quando VEM: ausente significa "use o default da
  // categoria", que é o caminho seguro e o preferido.
  if (d.audience !== undefined) assertAudience(d.audience)

  assertOptionalDate(d.competence, 'Competência')
  assertOptionalDate(d.dueOn, 'Vencimento')

  if (d.amount !== undefined && d.amount !== null) {
    const valor = Number(d.amount)
    if (!Number.isFinite(valor) || valor < 0) {
      throw createError({ statusCode: 422, statusMessage: 'Valor do documento inválido.' })
    }
  }
}

/**
 * O id que veio da rota, conferido que tem forma de uuid.
 *
 * Todas as rotas do painel faziam `if (!id) throw 400`, que pega o id AUSENTE e
 * deixa passar o id MALFORMADO. A diferença importa porque todo id deste
 * sistema é `uuid` no banco: `/api/admin/contracts/abc` chegava em
 * `.eq('id', 'abc')`, o Postgres devolvia 22P02, o repositório dava
 * `throw error` e a resposta era **500** — erro de servidor para o que é, no
 * fundo, um id que não existe.
 *
 * Continua 400 e não 404: quem chama aqui é membro autenticado do painel, e
 * "você mandou um id que não é id" é informação útil para ele. Nos endpoints do
 * PORTAL a resposta é 404, porque lá nada pode distinguir um id de outro — ver
 * `shared/utils/uuid.ts`.
 */
export function idDeRota(valor: string | null | undefined, rotulo = 'ID'): string {
  const id = (valor || '').trim()
  if (!ehUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: `${rotulo} inválido.` })
  }
  return id
}

/** Pessoa do contrato: `{ id }` de alguém da carteira, ou `{ nova }` com nome. */
function assertPessoa(v: unknown, rotulo: string, obrigatoria: boolean) {
  if (v === undefined || v === null) {
    if (obrigatoria) throw createError({ statusCode: 422, statusMessage: `Informe o ${rotulo}.` })
    return
  }
  const p = v as Record<string, unknown>
  if (typeof p.id === 'string') {
    if (!ehUuid(p.id)) throw createError({ statusCode: 422, statusMessage: `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} inválido.` })
    return
  }
  if (p.nova && typeof p.nova === 'object') {
    // Mesmas regras do cadastro de cliente, sem convite: quem é criado aqui
    // nasce sem acesso, e o convite (se pedido) sai depois, pelo caminho de sempre.
    assertPortalUserInput({ ...(p.nova as object), convidar: false })
    return
  }
  throw createError({ statusCode: 422, statusMessage: `Informe o ${rotulo}.` })
}

/** Destino do repasse (Pix ou conta), nos formatos que o CHECK da 0041 aceita. */
export function assertRepasseInput(v: unknown): asserts v is PayoutDestinationInput {
  if (v === undefined || v === null) throw createError({ statusCode: 422, statusMessage: 'Informe o Pix ou a conta do repasse.' })
  assertRepasse(v)
}

function assertRepasse(v: unknown) {
  if (v === undefined || v === null) return
  const r = v as Record<string, unknown>
  if (!String(r.holderName ?? '').trim()) throw createError({ statusCode: 422, statusMessage: 'Repasse: informe o titular.' })
  if (!tipoDeDocumento(String(r.holderDoc ?? ''))) {
    throw createError({ statusCode: 422, statusMessage: 'Repasse: CPF/CNPJ do titular inválido.' })
  }
  if (r.kind === 'pix') {
    if (!['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].includes(String(r.pixKeyType))) {
      throw createError({ statusCode: 422, statusMessage: 'Repasse: tipo de chave Pix inválido.' })
    }
    if (!String(r.pixKey ?? '').trim()) throw createError({ statusCode: 422, statusMessage: 'Repasse: informe a chave Pix.' })
    assertMaxLength(String(r.pixKey), 140, 'Chave Pix')
    if (!chavePixValida(r.pixKeyType as TipoChavePix, String(r.pixKey))) {
      throw createError({ statusCode: 422, statusMessage: `Repasse: a chave Pix não é um ${ROTULO_CHAVE_PIX[r.pixKeyType as TipoChavePix]} válido.` })
    }
    return
  }
  if (r.kind === 'conta_bancaria') {
    if (!/^\d{3}$/.test(String(r.bankCode ?? ''))) {
      throw createError({ statusCode: 422, statusMessage: 'Repasse: código do banco tem 3 dígitos (ex.: 001, 237, 341).' })
    }
    if (!/^\d{1,6}$/.test(String(r.branch ?? ''))) throw createError({ statusCode: 422, statusMessage: 'Repasse: agência inválida.' })
    if (!/^\d{1,20}$/.test(String(r.account ?? ''))) throw createError({ statusCode: 422, statusMessage: 'Repasse: conta inválida.' })
    if (!['corrente', 'poupanca', 'pagamento'].includes(String(r.accountType))) {
      throw createError({ statusCode: 422, statusMessage: 'Repasse: tipo de conta inválido.' })
    }
    return
  }
  throw createError({ statusCode: 422, statusMessage: 'Repasse: escolha Pix ou conta bancária.' })
}

/**
 * O contrato inteiro do assistente. Obrigatório só o que a locação não
 * existe sem (imóvel ou endereço, inquilino, aluguel, vencimento, início); o
 * resto vira pendência — ver `pendenciasDoContrato`.
 */
export function assertLeaseCreateInput(input: unknown): asserts input is LeaseCreateInput {
  if (!input || typeof input !== 'object') throw createError({ statusCode: 422, statusMessage: 'Dados inválidos.' })
  const l = input as Record<string, unknown>

  if (!(Number(l.rentAmount) > 0)) throw createError({ statusCode: 422, statusMessage: 'Informe o valor do aluguel.' })
  if (l.dueDay == null) throw createError({ statusCode: 422, statusMessage: 'Informe o dia do vencimento.' })
  if (!l.startedOn || !/^\d{4}-\d{2}-\d{2}$/.test(String(l.startedOn))) {
    throw createError({ statusCode: 422, statusMessage: 'Informe a data de início.' })
  }
  // Reaproveita as regras do contrato (vencimento, imóvel/endereço, prazo,
  // garantia) e dos campos internos (multa, juros, taxas), sem duplicar.
  assertContractInput({ ...l, code: String(l.code ?? '').trim() || 'gerado' })
  assertContractInternalInput(l)
  assertCaucaoDentroDoLimite(l.guaranteeType, l.guaranteeAmount, l.rentAmount)

  assertPessoa(l.inquilino, 'inquilino', true)
  assertPessoa(l.proprietario, 'proprietário', false)
  assertPessoa(l.fiador, 'fiador', false)
  if (l.fiador && l.guaranteeType !== 'fiador') {
    throw createError({ statusCode: 422, statusMessage: 'Fiador só com a garantia "Fiador" — a lei não permite duas garantias.' })
  }
  if (l.repasse && !l.proprietario) {
    throw createError({ statusCode: 422, statusMessage: 'O repasse precisa de um proprietário no contrato.' })
  }
  assertRepasse(l.repasse)
}

// ---------------------------------------------------------------------------
// Cobrança (0051)
// ---------------------------------------------------------------------------

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function assertValor(v: unknown, rotulo: string, { podeNegativo = false } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw createError({ statusCode: 422, statusMessage: `${rotulo}: valor inválido.` })
  if (!podeNegativo && v <= 0) throw createError({ statusCode: 422, statusMessage: `${rotulo}: o valor precisa ser maior que zero.` })
  // Teto de sanidade: um aluguel de R$ 10 milhões é dígito a mais, não negócio.
  if (Math.abs(v) > 10_000_000) throw createError({ statusCode: 422, statusMessage: `${rotulo}: valor alto demais.` })
  // Mais de 2 casas decimais é float de conta mal feita na tela; o banco
  // arredondaria calado e o boleto sairia 1 centavo diferente do mostrado.
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) {
    throw createError({ statusCode: 422, statusMessage: `${rotulo}: use no máximo 2 casas decimais.` })
  }
}

export function assertChargeCreateInput(input: unknown): asserts input is ChargeCreateInput {
  const b = (input ?? {}) as Record<string, unknown>
  if (b.kind !== undefined && b.kind !== 'mensal' && b.kind !== 'avulsa') {
    throw createError({ statusCode: 422, statusMessage: 'Tipo de cobrança inválido.' })
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.competence ?? ''))) {
    throw createError({ statusCode: 422, statusMessage: 'Informe o mês de referência (ocupação).' })
  }
  if (!DATA_ISO.test(String(b.dueOn ?? '')) || Number.isNaN(Date.parse(String(b.dueOn)))) {
    throw createError({ statusCode: 422, statusMessage: 'Informe o vencimento.' })
  }
  if (b.rentAmount !== undefined && b.rentAmount !== null) assertValor(b.rentAmount, 'Aluguel')
  if (b.extras !== undefined) {
    if (!Array.isArray(b.extras) || b.extras.length > 20) throw createError({ statusCode: 422, statusMessage: 'Itens inválidos.' })
    for (const x of b.extras as Record<string, unknown>[]) {
      if (!CHARGE_ITEM_KINDS_MANUAIS.includes(x?.kind as ChargeItemKind)) {
        throw createError({ statusCode: 422, statusMessage: 'Tipo de item inválido.' })
      }
      const rotulo = CHARGE_ITEM_LABELS[x.kind as ChargeItemKind]
      assertValor(x.amount, rotulo, { podeNegativo: true })
      // Desconto é o único item que reduz; os outros só somam. Sinal trocado
      // na tela viraria cobrança a menos sem ninguém perceber.
      if (x.kind === 'desconto' ? (x.amount as number) >= 0 : (x.amount as number) <= 0) {
        throw createError({ statusCode: 422, statusMessage: `${rotulo}: ${x.kind === 'desconto' ? 'desconto é negativo' : 'valor precisa ser positivo'}.` })
      }
      if (x.description != null) assertMaxLength(String(x.description), 120, 'Descrição do item')
    }
  }
}

export function assertManualSettlementInput(input: unknown): asserts input is ManualSettlementInput {
  const b = (input ?? {}) as Record<string, unknown>
  assertValor(b.amount, 'Pagamento')
  if (!DATA_ISO.test(String(b.settledOn ?? ''))) throw createError({ statusCode: 422, statusMessage: 'Informe a data do pagamento.' })
  if (!MANUAL_SETTLEMENT_METHODS.includes(b.method as SettlementMethod)) {
    throw createError({ statusCode: 422, statusMessage: 'Forma de pagamento inválida.' })
  }
}

export function assertPaymentAccountInput(input: unknown): asserts input is PaymentAccountInput {
  const b = (input ?? {}) as Record<string, unknown>
  if (b.provider !== 'asaas' && b.provider !== 'simulado') throw createError({ statusCode: 422, statusMessage: 'Provedor inválido.' })
  if (b.environment !== 'sandbox' && b.environment !== 'producao') throw createError({ statusCode: 422, statusMessage: 'Ambiente inválido.' })
  if (b.provider === 'simulado' && b.environment !== 'sandbox') {
    throw createError({ statusCode: 422, statusMessage: 'O provedor simulado só existe como demonstração (sandbox).' })
  }
  if (b.provider === 'asaas') {
    const chave = String(b.apiKey ?? '').trim()
    if (chave.length < 20 || chave.length > 400 || /\s/.test(chave)) {
      throw createError({ statusCode: 422, statusMessage: 'Cole a chave de API completa do Asaas (começa com $aact_).' })
    }
    // A chave de sandbox tem `_hmlg_` no meio. Chave de um ambiente no outro
    // é o erro de configuração mais comum, e o Asaas só responde 401 — sem
    // dizer que o problema é o ambiente.
    const ehSandbox = chave.includes('_hmlg_')
    if (b.environment === 'producao' && ehSandbox) {
      throw createError({ statusCode: 422, statusMessage: 'Esta é uma chave de SANDBOX. Escolha o ambiente "Sandbox (testes)" ou cole a chave de produção.' })
    }
    if (b.environment === 'sandbox' && chave.includes('_prod_')) {
      throw createError({ statusCode: 422, statusMessage: 'Esta é uma chave de PRODUÇÃO. Escolha o ambiente "Produção" ou cole a chave do sandbox.' })
    }
  }
}
