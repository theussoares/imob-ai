import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { LeaseCreateInput, PessoaDoContrato } from '~~/shared/models/lease'
import { fimDoPrazo } from '~~/shared/models/lease'
import type { Contract, ContractPartyRole, PortalUser } from '~~/shared/models/portal'
import { getPropertyById } from '~~/server/repositories/property.repository'
import { createClientRecord, getPortalUser } from '~~/server/repositories/portal-user.repository'
import {
  addContractParty,
  createContract,
  nextContractCode,
  upsertContractInternal,
} from '~~/server/repositories/contract.repository'
import { replacePayoutDestination } from '~~/server/repositories/payout-destination.repository'
import { convidarClientePortal } from '~~/server/repositories/portal-invite.repository'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { portalOrigin, urlDefinirSenha, urlLoginPortal } from '~~/server/utils/portal-origin'
import type { Tenant } from '~~/shared/models/tenant'

type Client = SupabaseClient<Database>

export interface ResultadoLocacao {
  contrato: Contract
  /** Convites da Área do Cliente pedidos no assistente, e o que aconteceu com cada um. */
  convites: { nome: string; enviado: boolean }[]
}

/** Pessoa do assistente: da carteira (conferida contra o tenant) ou criada agora, sem acesso. */
async function resolverPessoa(client: Client, tenantId: string, p: PessoaDoContrato): Promise<PortalUser> {
  if ('id' in p) {
    const achada = await getPortalUser(client, tenantId, p.id)
    // 422 e não 404: o erro é do formulário (pessoa de outra imobiliária, ou
    // apagada em outra aba), não de rota.
    if (!achada) throw createError({ statusCode: 422, statusMessage: 'Uma das pessoas do contrato não foi encontrada.' })
    return achada
  }
  return createClientRecord(client, tenantId, { ...p.nova, convidar: false })
}

/**
 * Cria a locação inteira, na ordem em que o banco precisa: pessoas → contrato
 * → campos internos → partes → destino do repasse → imóvel alugado.
 *
 * Sem transação (o PostgREST não oferece uma entre chamadas), então com
 * COMPENSAÇÃO: se algo falha depois do contrato existir, o contrato é apagado
 * (partes e campos internos vão junto, por cascata) e o erro sobe. As pessoas
 * criadas no caminho ficam — são clientes válidos da carteira, e apagá-las
 * poderia levar junto alguém que outra aba acabou de vincular.
 *
 * Tudo pelo client do MEMBRO (RLS ligada) e com o tenant da sessão em cada
 * filtro; a service_role só entra no destino do repasse (tabela financeira,
 * escrita revogada do membro pela 0042) e no convite (API de admin).
 */
export async function criarLocacao(
  client: Client,
  tenant: Tenant,
  input: LeaseCreateInput,
  userId: string,
): Promise<ResultadoLocacao> {
  // `contracts.property_id` tem FK simples: sem esta leitura com o tenant no
  // filtro, um id de imóvel de outra imobiliária seria aceito pelo banco.
  // Service_role porque a 0031 fechou as colunas internas de `properties` ao
  // `authenticated` e o repositório lê `select('*')` (e usa `location` para o
  // endereço): com o client do membro o PostgREST devolvia 403 e o assistente
  // inteiro caía em 500. O tenant no filtro é a proteção.
  const imovel = input.propertyId ? await getPropertyById(serviceSupabase(), tenant.id, input.propertyId) : null
  if (input.propertyId && !imovel) throw createError({ statusCode: 422, statusMessage: 'Imóvel não encontrado.' })

  const inquilino = await resolverPessoa(client, tenant.id, input.inquilino)
  const proprietario = input.proprietario ? await resolverPessoa(client, tenant.id, input.proprietario) : null
  const fiador = input.fiador ? await resolverPessoa(client, tenant.id, input.fiador) : null

  const addressLabel =
    input.addressLabel?.trim() ||
    (imovel ? [imovel.location || imovel.title, imovel.neighborhood].filter(Boolean).join(' · ') : null)
  const endsOn = input.termMonths ? fimDoPrazo(input.startedOn, input.termMonths) : null

  const base = {
    propertyId: imovel?.id ?? null,
    addressLabel,
    status: 'ativo' as const,
    startedOn: input.startedOn,
    endsOn,
    rentAmount: input.rentAmount,
    dueDay: input.dueDay,
    adjustmentIndex: input.adjustmentIndex ?? null,
    termMonths: input.termMonths ?? null,
    guaranteeType: input.guaranteeType ?? null,
  }

  // Código digitado é respeitado (e o índice único recusa repetido com
  // mensagem). Código automático tenta o seguinte se outra aba pegou o mesmo.
  let contrato: Contract | null = null
  const digitado = input.code?.trim()
  for (let tentativa = 0; tentativa < 3 && !contrato; tentativa++) {
    const code = digitado || (await nextContractCode(client, tenant.id, Number(input.startedOn.slice(0, 4))))
    try {
      contrato = await createContract(client, tenant.id, { ...base, code })
    } catch (e) {
      if (digitado || (e as { statusCode?: number }).statusCode !== 409) throw e
    }
  }
  if (!contrato) throw createError({ statusCode: 409, statusMessage: 'Não foi possível gerar o código do contrato. Tente de novo.' })

  try {
    await upsertContractInternal(client, contrato.id, {
      adminFeePercent: input.adminFeePercent ?? null,
      rentFeePercent: input.rentFeePercent ?? null,
      payoutBusinessDays: input.payoutBusinessDays ?? null,
      finePercent: input.finePercent ?? null,
      interestMonthlyPercent: input.interestMonthlyPercent ?? null,
      guaranteeAmount: input.guaranteeAmount ?? null,
      guaranteeDetails: input.guaranteeDetails ?? null,
      fireInsurancePayer: input.fireInsurancePayer ?? null,
    })
    const partes: [PortalUser | null, ContractPartyRole][] = [
      [inquilino, 'inquilino'],
      [proprietario, 'proprietario'],
      [fiador, 'fiador'],
    ]
    for (const [pessoa, papel] of partes) {
      if (pessoa) await addContractParty(client, tenant.id, contrato.id, pessoa.id, papel)
    }
    if (input.repasse && proprietario) {
      // Service_role: a 0042 fechou a escrita financeira ao papel do membro.
      await replacePayoutDestination(serviceSupabase(), tenant.id, proprietario.id, input.repasse, userId)
    }
  } catch (e) {
    await client.from('contracts').delete().eq('tenant_id', tenant.id).eq('id', contrato.id)
    throw e
  }

  // Depois do contrato garantido: falhar aqui não desfaz a locação. O imóvel
  // continua "Publicado" e a imobiliária troca à mão — defeito visível, não
  // contrato perdido.
  if (imovel && input.marcarImovelAlugado) {
    const { error } = await client
      .from('properties')
      .update({ status: 'rented' })
      .eq('tenant_id', tenant.id)
      .eq('id', imovel.id)
    if (error) logWarn('locacao.imovel_nao_marcado', { tenant: tenant.slug, reason: errMessage(error) })
    else await invalidateTenantCache(tenant.id)
  }

  const convites: ResultadoLocacao['convites'] = []
  if (input.convidarPartes) {
    const pendentes = [inquilino, proprietario, fiador].filter((p): p is PortalUser => !!p && !!p.email && !p.userId)
    if (pendentes.length) {
      const service = serviceSupabase()
      const origem = await portalOrigin(service, tenant)
      const remetente = { nome: tenant.name, endereco: await remetenteDoTenant(tenant), replyTo: tenant.email }
      for (const p of pendentes) {
        try {
          const r = await convidarClientePortal(
            service,
            tenant.id,
            remetente,
            { name: p.name, email: p.email, doc: p.doc, phone: p.phone },
            urlDefinirSenha(origem),
            urlLoginPortal(origem),
          )
          convites.push({ nome: p.name, enviado: r.emailEnviado })
        } catch (e) {
          // O contrato está feito; o convite se reenvia pela tela de Clientes.
          logWarn('locacao.convite_falhou', { tenant: tenant.slug, reason: errMessage(e) })
          convites.push({ nome: p.name, enviado: false })
        }
      }
    }
  }

  return { contrato, convites }
}
