import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import { buscarConvite } from '~~/server/repositories/gestao-member.repository'
import type { RegistroMembro } from '~~/server/mappers/gestao-member.mapper'
import { hashTokenConvite } from '~~/server/utils/gestao-otp'

/**
 * Convite do painel de gestão: token de 256 bits, guardado só como HMAC, validade
 * de 72 h (`CONVITE_VALIDADE_MS` do domínio). Mesmas mensagens da tela do demo.
 */

const ERROS = {
  inexistente: 'Este convite não existe. Peça um novo a quem convidou você.',
  usado: 'Este convite já foi usado. Se foi você, entre com e-mail e senha.',
  expirado: 'Este convite expirou (vale 72 horas). Peça um novo a quem convidou você.',
} as const

export type MotivoConvite = keyof typeof ERROS
export type ConsultaConvite = { ok: true; registro: RegistroMembro } | { ok: false; motivo: MotivoConvite; erro: string }

/** O token que vai no link. Só existe no e-mail; o banco guarda o HMAC. */
export function novoTokenConvite(): string {
  return randomBytes(32).toString('hex')
}

const falhaConvite = (motivo: MotivoConvite): ConsultaConvite => ({ ok: false, motivo, erro: ERROS[motivo] })

/**
 * Valida o token SEM consumi-lo. Convite revogado é apagado, então cai em
 * `inexistente` — para quem tem o link, é o mesmo «peça um novo».
 */
export async function consultarConviteGestao(
  db: SupabaseClient<Database>,
  tenantId: string,
  token: string,
  agora: number,
  pepper: string,
): Promise<ConsultaConvite> {
  // Sem ir ao banco com o que não tem forma de token.
  if (!/^[0-9a-f]{64}$/.test(token)) return falhaConvite('inexistente')
  const r = await buscarConvite(db, tenantId, hashTokenConvite(pepper, token))
  if (!r) return falhaConvite('inexistente')
  if (r.userId) return falhaConvite('usado')
  if (!r.conviteExpiraEm || Date.parse(r.conviteExpiraEm) <= agora) return falhaConvite('expirado')
  return { ok: true, registro: r }
}
