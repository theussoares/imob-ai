import type { PropertyInput } from '~~/shared/models/property'
import type { TenantSettingsInput } from '~~/shared/models/tenant'
import type { BrokerInput } from '~~/shared/models/broker'
import type { LeadCreateInput, LeadStage, LeadType, LeadUpdateInput } from '~~/shared/models/lead'
import { ALL_LEAD_STAGES, LEAD_TYPES } from '~~/shared/models/lead'
import { isValidWhatsapp } from '~~/shared/utils/phone'
import { PROPERTY_TYPES } from '~~/shared/models/property-type'

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

  if (t.heroImagePosition !== undefined && !HERO_POSITIONS.includes(t.heroImagePosition as string)) {
    throw createError({ statusCode: 422, statusMessage: 'Posição da imagem do hero inválida.' })
  }

  // WhatsApp/telefone alimentam links wa.me/tel: — exigem DDI 55 (12–13 dígitos).
  for (const field of ['whatsapp', 'phone'] as const) {
    const v = t[field]
    if (v !== undefined && v !== null && String(v).trim() && !isValidWhatsapp(String(v))) {
      throw createError({ statusCode: 422, statusMessage: 'Número de contato inválido.' })
    }
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

/** Valida a edição de um lead (mover no funil, anotar, agendar). */
export function assertLeadUpdateInput(input: unknown): asserts input is LeadUpdateInput {
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
  assertOptionalDate(l.nextContactAt, 'Data de retorno')
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
}
