import type { LeadInput } from '~~/shared/models/lead'
import { LEAD_TYPE_LABELS, seekingTypeFor, toLeadSource, toLeadType } from '~~/shared/models/lead'
import { isValidBrPhone, onlyDigits } from '~~/shared/utils/phone'
import { createLead } from '~~/server/repositories/lead.repository'
import { getPropertyByCode } from '~~/server/repositories/property.repository'
import { avisarNovoLead } from '~~/server/utils/lead-alert'
import { distribuirPelaRoleta } from '~~/server/utils/lead-crm'
import { formatPropertyCode } from '~~/shared/utils/property-specs'

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
  const property = body.propertyCode
    ? await getPropertyByCode(publicSupabase(), tenant.id, body.propertyCode)
    : null
  const propertyId = property?.id ?? null
  const propertyPurpose = property?.purpose ?? null

  // Origem e tipo entram por lista fechada: este handler é público, e sem
  // whitelist qualquer um poderia inventar valores e sujar a métrica de
  // aquisição que o painel mostra pro cliente.
  const source = toLeadSource(body.source)
  // Quando o contato parte de um imóvel, o tipo não é palpite: quem escreve na
  // página de uma casa à venda quer comprar; na de aluguel, quer alugar. O
  // formulário só decide quando não há imóvel (ex.: "quero vender o meu").
  const leadType = propertyPurpose ? seekingTypeFor(propertyPurpose) : toLeadType(body.leadType)

  let leadId: string
  try {
    leadId = await createLead(service, {
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

  // Antes do aviso, para o e-mail ir também para o corretor que recebeu o
  // lead: é ele quem precisa ligar, e o aviso só para os donos do painel
  // deixaria a roleta dependendo de alguém repassar.
  const corretor = await distribuirPelaRoleta(service, tenant, leadId)

  // `await`, e não `event.waitUntil`: o preset `vercel` do Nitro 2.13 não
  // repassa o `waitUntil` para a plataforma (conferido no runtime do preset) —
  // a promessa ficaria só numa lista interna e a função seria congelada assim
  // que a resposta saísse, levando o aviso junto, sem log nenhum. O custo é o
  // visitante esperar o envio, e o teto de `avisarNovoLead` limita essa espera.
  await avisarNovoLead(tenant, {
    nome: name,
    telefone: phone,
    mensagem: message,
    tipo: LEAD_TYPE_LABELS[leadType],
    imovel: property ? { codigo: formatPropertyCode(property.code), titulo: property.title } : null,
  }, corretor?.email ? [corretor.email] : [])

  return { ok: true }
})
