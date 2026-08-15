import type { PropertyInput } from '~~/shared/models/property'
import type { TenantSettingsInput } from '~~/shared/models/tenant'

const TYPES = ['casa', 'apartamento', 'sobrado', 'terreno']
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
}
