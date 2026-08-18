import type { LeadInput } from '~~/shared/models/lead'
import { seekingTypeFor, toLeadSource, toLeadType } from '~~/shared/models/lead'
import { isValidBrPhone, onlyDigits } from '~~/shared/utils/phone'
import { createLead } from '~~/server/repositories/lead.repository'
import { getPropertyByCode } from '~~/server/repositories/property.repository'

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

  // Anti-flood por telefone dentro do tenant.
  await assertSubmitRateLimit(service, {
    table: 'leads',
    tenantId: tenant.id,
    column: 'phone',
    value: phone,
  })

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
