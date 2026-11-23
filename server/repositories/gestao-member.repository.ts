import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { MembroGestaoLista, Perfil } from '~~/layers/gestao/domain/types'
import type { MembroGestao } from '~~/server/utils/gestao-auth'
import { toMembroGestao, toMembroLista, toRegistroMembro, type RegistroMembro } from '~~/server/mappers/gestao-member.mapper'
import { regraConvite } from '~~/server/utils/gestao-membros'

type Client = SupabaseClient<Database>

/**
 * Membros do painel de gestão (`gestao_members`, 0059).
 *
 * Todo acesso é pela service_role: a tabela não tem policy nem grant para
 * anon/authenticated. O `tenant_id` em cada where é a única coisa entre uma
 * imobiliária e outra — inclusive nos `id` que chegam pela URL.
 *
 * Colunas listadas e nunca `*`: o hash do convite não sai deste arquivo. Quem
 * precisa dele busca POR ele (`buscarConvite`).
 */
const COLUNAS =
  'id, tenant_id, user_id, email, nome, perfil, broker_id, invite_token_hash, invite_expires_at, convidado_por, created_at, updated_at'

/** Membro que aceitou o convite, pelo usuário do Supabase Auth. É a pergunta de toda requisição do painel. */
export async function buscarMembroPorUsuario(db: Client, tenantId: string, userId: string): Promise<MembroGestao | null> {
  const { data, error } = await db
    .from('gestao_members')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? toMembroGestao(data) : null
}

/**
 * Membro que já aceitou o convite (tem `user_id`) com este e-mail, neste tenant. É a única forma de a
 * recuperação de senha saber para quem mandar o link: convite pendente ainda não tem conta para recuperar.
 */
export async function buscarMembroAtivoPorEmail(db: Client, tenantId: string, email: string): Promise<MembroGestao | null> {
  const { data, error } = await db
    .from('gestao_members')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .not('user_id', 'is', null)
    .maybeSingle()
  if (error) throw error
  return data ? toMembroGestao(data) : null
}

export async function buscarRegistroMembro(db: Client, tenantId: string, id: string): Promise<RegistroMembro | null> {
  const { data, error } = await db.from('gestao_members').select(COLUNAS).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toRegistroMembro(data) : null
}

export async function listarMembros(db: Client, tenantId: string, agora: number): Promise<MembroGestaoLista[]> {
  const { data, error } = await db
    .from('gestao_members')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).flatMap((row) => {
    const r = toRegistroMembro(row)
    return r ? [toMembroLista(r, agora)] : []
  })
}

/** Convite pelo hash do token, só neste tenant. O link de outra imobiliária não abre aqui. */
export async function buscarConvite(db: Client, tenantId: string, tokenHash: string): Promise<RegistroMembro | null> {
  const { data, error } = await db
    .from('gestao_members')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .eq('invite_token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  return data ? toRegistroMembro(data) : null
}

export interface DadosConvite {
  /** Já normalizado (minúsculo, sem espaço). */
  email: string
  nome: string
  perfil: Perfil
  brokerId: string | null
  tokenHash: string
  expiraEm: string
  convidadoPor: string
  /** Perfil de quem convida: teto também para o convite pendente que será sobrescrito. */
  perfilConvidante: Perfil
}

/**
 * Cria ou renova o convite do e-mail. Um registro por e-mail por tenant: convidar
 * de novo troca token, perfil e prazo do mesmo registro — o link anterior para
 * de valer na hora.
 *
 * E-mail que já tem conta ativa aqui é 409: o convite não pode ser o caminho
 * para trocar o perfil de alguém (isso é o PATCH, que exige `admin`).
 */
export async function gravarConvite(db: Client, tenantId: string, d: DadosConvite): Promise<RegistroMembro> {
  const { data: existente, error } = await db
    .from('gestao_members')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .eq('email', d.email)
    .maybeSingle()
  if (error) throw error
  if (existente?.user_id) {
    throw createError({ statusCode: 409, statusMessage: 'Já existe uma conta com este e-mail.' })
  }
  // Reconvidar sobrescreve o convite pendente. Sem isto, o Jurídico trocaria o
  // convite de Dono que o Dono fez por um de Jurídico — o que o DELETE já barra.
  const teto = existente && regraConvite(d.perfilConvidante, existente.perfil as Perfil)
  if (teto) throw createError({ statusCode: 403, statusMessage: 'Só o Dono altera um convite de Dono.' })

  const campos = {
    nome: d.nome,
    perfil: d.perfil,
    broker_id: d.brokerId,
    invite_token_hash: d.tokenHash,
    invite_expires_at: d.expiraEm,
    convidado_por: d.convidadoPor,
    updated_at: new Date().toISOString(),
  }

  const gravado = existente
    ? await db
        .from('gestao_members')
        .update(campos)
        .eq('tenant_id', tenantId)
        .eq('id', existente.id)
        // Se a pessoa aceitou entre a leitura e aqui, o update não acha a linha.
        .is('user_id', null)
        .select(COLUNAS)
        .maybeSingle()
    : await db
        .from('gestao_members')
        .insert({ tenant_id: tenantId, email: d.email, ...campos })
        .select(COLUNAS)
        .maybeSingle()

  if (gravado.error) {
    if ((gravado.error as { code?: string }).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Já existe um convite ou conta com este e-mail.' })
    }
    throw gravado.error
  }
  const r = gravado.data ? toRegistroMembro(gravado.data) : null
  if (!r) throw createError({ statusCode: 409, statusMessage: 'Já existe uma conta com este e-mail.' })
  return r
}

/**
 * Liga o usuário do Supabase Auth ao convite. Só pega convite ainda sem usuário:
 * duas abas aceitando o mesmo link, a segunda recebe `false`.
 */
export async function vincularUsuarioAoConvite(
  db: Client,
  tenantId: string,
  id: string,
  userId: string,
  nome: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('gestao_members')
    .update({ user_id: userId, nome, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('user_id', null)
    .select('id')
  if (error) {
    // O mesmo usuário já é membro deste tenant por outro registro.
    if ((error as { code?: string }).code === '23505') return false
    throw error
  }
  return (data ?? []).length > 0
}

export async function alterarMembro(
  db: Client,
  tenantId: string,
  id: string,
  patch: { perfil: Perfil; brokerId: string | null },
): Promise<RegistroMembro | null> {
  const { data, error } = await db
    .from('gestao_members')
    .update({ perfil: patch.perfil, broker_id: patch.brokerId, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(COLUNAS)
    .maybeSingle()
  if (error) throw error
  return data ? toRegistroMembro(data) : null
}

/**
 * Tira o acesso. Apaga também as sessões verificadas e o código pendente da
 * pessoa NESTE tenant: o vínculo sozinho já barra a próxima requisição
 * (`requireGestaoMember` procura o membro sempre), e o resto é para não deixar
 * linha que voltaria a valer se o mesmo usuário fosse convidado de novo.
 */
export async function removerMembro(db: Client, tenantId: string, alvo: { id: string; userId: string | null }): Promise<void> {
  const { error } = await db.from('gestao_members').delete().eq('tenant_id', tenantId).eq('id', alvo.id)
  if (error) throw error
  if (!alvo.userId) return
  const s = await db.from('gestao_sessions').delete().eq('tenant_id', tenantId).eq('user_id', alvo.userId)
  if (s.error) throw s.error
  const o = await db.from('gestao_otp').delete().eq('tenant_id', tenantId).eq('user_id', alvo.userId)
  if (o.error) throw o.error
}

/** Quantos Donos ATIVOS (que aceitaram) o tenant tem. Convite pendente não administra nada. */
export async function contarDonosAtivos(db: Client, tenantId: string): Promise<number> {
  const { count, error } = await db
    .from('gestao_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('perfil', 'dono')
    .not('user_id', 'is', null)
  if (error) throw error
  return count ?? 0
}

/** O corretor existe NESTE tenant? A FK composta também barra, mas aqui vira 422 legível em vez de 500. */
export async function corretorDoTenant(db: Client, tenantId: string, brokerId: string): Promise<boolean> {
  const { data, error } = await db.from('brokers').select('id').eq('tenant_id', tenantId).eq('id', brokerId).maybeSingle()
  if (error) throw error
  return !!data
}
