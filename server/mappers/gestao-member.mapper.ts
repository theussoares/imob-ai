import type { Database } from '~~/shared/types/database.types'
import type { MembroGestaoLista, Perfil, StatusMembro } from '~~/layers/gestao/domain/types'
import type { MembroGestao } from '~~/server/utils/gestao-auth'

type Row = Database['public']['Tables']['gestao_members']['Row']

const PERFIS: readonly Perfil[] = ['corretor', 'recepcao', 'juridico', 'dono']
export const perfilValido = (v: unknown): v is Perfil => typeof v === 'string' && (PERFIS as string[]).includes(v)

/**
 * Registro completo do membro para uso interno do servidor (convite e gestão de
 * acesso). Sem o hash do convite: quem precisa dele busca POR ele, nunca o lê.
 */
export interface RegistroMembro {
  id: string
  userId: string | null
  email: string
  nome: string
  perfil: Perfil
  brokerId: string | null
  convidadoPor: string
  conviteExpiraEm: string | null
  criadoEm: string
}

/** Perfil desconhecido no banco vira `null`: falha fechado em vez de supor um perfil. */
export function toRegistroMembro(row: Pick<Row, keyof Row>): RegistroMembro | null {
  if (!perfilValido(row.perfil)) return null
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    nome: row.nome,
    perfil: row.perfil,
    brokerId: row.broker_id,
    convidadoPor: row.convidado_por,
    conviteExpiraEm: row.invite_expires_at,
    criadoEm: row.created_at,
  }
}

export function toMembroGestao(row: Pick<Row, keyof Row>): MembroGestao | null {
  const r = toRegistroMembro(row)
  if (!r || !r.userId) return null
  return { id: r.id, userId: r.userId, tenantId: row.tenant_id, nome: r.nome, perfil: r.perfil, brokerId: r.brokerId }
}

export function statusMembro(r: Pick<RegistroMembro, 'userId' | 'conviteExpiraEm'>, agora: number): StatusMembro {
  if (r.userId) return 'ativo'
  return r.conviteExpiraEm && Date.parse(r.conviteExpiraEm) > agora ? 'pendente' : 'expirado'
}

export function toMembroLista(r: RegistroMembro, agora: number): MembroGestaoLista {
  const status = statusMembro(r, agora)
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    perfil: r.perfil,
    brokerId: r.brokerId,
    status,
    convidadoPor: r.convidadoPor,
    conviteExpiraEm: status === 'ativo' ? null : r.conviteExpiraEm,
    criadoEm: r.criadoEm,
  }
}
