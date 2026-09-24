import type { PropertyInput, PropertyPurpose } from '~~/shared/models/property'
import { areaRangeError, priceRangeError, roomsRangeError } from '~~/shared/utils/property-limits'
import type { TenantSettingsInput } from '~~/shared/models/tenant'
import type { BrokerInput } from '~~/shared/models/broker'
import type { LeadCreateInput, LeadStage, LeadType, LeadUpdateInput } from '~~/shared/models/lead'
import { ALL_LEAD_STAGES, LEAD_TYPES } from '~~/shared/models/lead'
import { isValidWhatsapp } from '~~/shared/utils/phone'
import { dentroDoBrasil } from '~~/shared/utils/address'
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
  // Foto vem de upload para o Storage — só http(s), nunca um esquema executável
  // (mesma regra dos blocos de imagem da página "Quem somos").
  if (b.photoUrl !== undefined && b.photoUrl !== null && String(b.photoUrl).trim() && !/^https?:\/\//i.test(String(b.photoUrl).trim())) {
    throw createError({ statusCode: 422, statusMessage: 'Foto inválida.' })
  }
  if (b.bio !== undefined && b.bio !== null && String(b.bio).length > 500) {
    throw createError({ statusCode: 422, statusMessage: 'Minibio muito longa (máx. 500 caracteres).' })
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
  // errado aqui não é campo errado: é convite entregue a outra pessoa.
  const email = String(u.email ?? '').trim()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw createError({ statusCode: 422, statusMessage: 'E-mail inválido.' })
  }

  if (u.phone !== undefined && u.phone !== null && String(u.phone).trim() && !isValidWhatsapp(String(u.phone))) {
    throw createError({ statusCode: 422, statusMessage: 'WhatsApp/telefone do cliente inválido.' })
  }
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
