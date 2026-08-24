import type { LeadInput } from '~~/shared/models/lead'
import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { seekingTypeFor, toLeadSource, toLeadType } from '~~/shared/models/lead'
import { isValidBrPhone, onlyDigits } from '~~/shared/utils/phone'
import { createLead } from '~~/server/repositories/lead.repository'
import { getPropertyByCode } from '~~/server/repositories/property.repository'

/**
 * Hash do IP para o anti-flood, sem guardar o IP puro.
 *
 * Devolve `null` — e a trava por IP simplesmente não roda — em dois casos:
 *
 *  - sem header de plataforma, porque identificar errado é pior que não
 *    identificar (ver `clientIpFrom`);
 *  - sem `RATE_LIMIT_IP_SALT`. Sem sal isto seria `sha256(ip)`, e o espaço IPv4
 *    inteiro tem 2^32 endereços: a tabela completa se computa em minutos, então
 *    o hash não esconderia nada de quem lesse a tabela. Guardar um pseudônimo
 *    reversível é pior que não guardar — some a proteção E fica o dado.
 */
function requestIpHash(event: H3Event): string | null {
  const ip = clientIpFrom((name) => getHeader(event, name))
  if (!ip) return null

  const salt = useRuntimeConfig().rateLimitIpSalt || ''
  if (!salt) {
    // Precisa gritar: sem isto a segunda trava fica desligada em silêncio.
    logWarn('ratelimit.ip_salt_missing', {})
    return null
  }

  return createHash('sha256').update(`${salt}:${rateLimitIpKey(ip)}`).digest('hex')
}

/**
 * Registra um lead do formulário de contato público.
 *
 * A gravação usa serviceSupabase (e não o client anon) porque a tabela `leads`
 * não aceita mais escrita do papel público: a anon key vai no HTML de todo site,
 * então antes qualquer um postava direto no Supabase e pulava estas validações.
 * Agora este handler é o único caminho até a tabela.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  const body = await readBody<LeadInput>(event)

  const name = (body?.name || '').trim()
  const phone = onlyDigits(body?.phone)
  const message = body?.message?.trim() || null

  if (!name) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Nome é obrigatório.',
    })
  }
  if (!isValidBrPhone(phone)) {
    throw createError({ statusCode: 422, statusMessage: 'Telefone inválido.' })
  }
  // Sem teto, `message` aceitaria texto de qualquer tamanho.
  assertMaxLength(name, 120, 'Nome')
  if (message) assertMaxLength(message, 2000, 'Mensagem')

  const service = serviceSupabase()
  const ipHash = requestIpHash(event)

  // Anti-flood por telefone dentro do tenant.
  await assertSubmitRateLimit(service, {
    table: 'leads',
    tenantId: tenant.id,
    column: 'phone',
    value: phone,
  })

  // Segunda trava: bloqueia rotação de telefone pelo mesmo IP.
  if (ipHash) {
    await assertSubmitRateLimit(service, {
      table: 'leads',
      tenantId: tenant.id,
      column: 'ip_hash',
      value: ipHash,
      max: 6,
    })
  }

  // Leitura segue pelo client público: RLS garante que só imóvel ativo do tenant
  // resolve, e não há motivo pra usar a chave privilegiada aqui.
  let propertyId: string | null = null
  let propertyPurpose: 'venda' | 'aluguel' | null = null
  if (body.propertyCode) {
    const property = await getPropertyByCode(publicSupabase(), tenant.id, body.propertyCode)
    propertyId = property?.id ?? null
    propertyPurpose = property?.purpose ?? null
  }

  // Origem e tipo entram por lista fechada: este handler é público, e sem
  // whitelist qualquer um poderia inventar valores e sujar a métrica de
  // aquisição que o painel mostra pro cliente.
  const source = toLeadSource(body.source)
  // Quando o contato parte de um imóvel, o tipo não é palpite: quem escreve na
  // página de uma casa à venda quer comprar; na de aluguel, quer alugar. O
  // formulário só decide quando não há imóvel (ex.: "quero vender o meu").
  const leadType = propertyPurpose ? seekingTypeFor(propertyPurpose) : toLeadType(body.leadType)

  try {
    await createLead(service, {
      tenantId: tenant.id,
      propertyId,
      name,
      phone,
      ipHash,
      message,
      source,
      leadType,
    })
  } catch (e) {
    // Sem isto o lead some calado: o visitante vê erro e ninguém fica sabendo.
    // Nada de nome/telefone/mensagem no log — é dado pessoal de terceiro.
    logError('lead.create_failed', {
      tenant: tenant.slug,
      propertyCode: body.propertyCode ?? null,
      source,
      reason: errMessage(e),
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Não foi possível registrar seu contato. Tente novamente.',
    })
  }

  return { ok: true }
})
