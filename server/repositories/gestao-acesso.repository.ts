import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { EstadoOtp } from '~~/server/utils/gestao-otp'

type Client = SupabaseClient<Database>
type OtpRow = Database['public']['Tables']['gestao_otp']['Row']

/**
 * Estado do acesso ao /gestao: código do 2º fator, sessões que o cumpriram e
 * falhas de login. Tudo por service_role, tudo com `tenant_id` no where.
 */

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null)
const iso = (n: number | null) => (n === null ? null : new Date(n).toISOString())

function toEstadoOtp(r: OtpRow): EstadoOtp {
  return {
    codeHash: r.code_hash,
    expiraEm: Date.parse(r.expires_at),
    tentativas: r.attempts,
    bloqueadoAte: ms(r.locked_until),
    enviadoEm: Date.parse(r.last_sent_at),
    consumidoEm: ms(r.consumed_at),
  }
}

const colunasOtp = (e: EstadoOtp) => ({
  code_hash: e.codeHash,
  expires_at: iso(e.expiraEm)!,
  attempts: e.tentativas,
  locked_until: iso(e.bloqueadoAte),
  last_sent_at: iso(e.enviadoEm)!,
  consumed_at: iso(e.consumidoEm),
})

export async function lerOtp(db: Client, tenantId: string, userId: string): Promise<EstadoOtp | null> {
  const { data, error } = await db
    .from('gestao_otp')
    .select('tenant_id, user_id, code_hash, expires_at, attempts, locked_until, last_sent_at, consumed_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? toEstadoOtp(data) : null
}

/**
 * Código novo: substitui o anterior (um código vivo por pessoa por tenant) — mas
 * só se o anterior ainda é o que foi lido.
 *
 * O envio do e-mail acontece entre a leitura e esta gravação, e leva tempo. Sem a
 * condição, as tentativas feitas nesse meio (e o bloqueio que elas gravassem)
 * seriam apagadas pelo estado velho: reenviar a cada minuto e chutar durante o
 * envio daria ~5 palpites por minuto em vez de 5 a cada 15 (revisão de segurança
 * da F1). `attempts` muda a cada tentativa e `code_hash` a cada emissão; os dois
 * juntos dizem se alguém passou na frente. `false` = não gravou.
 */
export async function gravarOtpNovoSe(
  db: Client,
  tenantId: string,
  userId: string,
  e: EstadoOtp,
  anterior: Pick<EstadoOtp, 'tentativas' | 'codeHash'> | null,
): Promise<boolean> {
  if (!anterior) {
    const { error } = await db.from('gestao_otp').insert({ tenant_id: tenantId, user_id: userId, ...colunasOtp(e) })
    if (!error) return true
    if ((error as { code?: string }).code === '23505') return false
    throw error
  }
  const { data, error } = await db
    .from('gestao_otp')
    .update(colunasOtp(e))
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('attempts', anterior.tentativas)
    .eq('code_hash', anterior.codeHash)
    .select('user_id')
  if (error) throw error
  return (data ?? []).length > 0
}

/**
 * Grava o resultado de uma tentativa SÓ se ninguém gravou outra no meio.
 *
 * A condição `attempts = lido` é o que faz o limite de 5 valer com requisições em
 * paralelo: sem ela, 100 chamadas simultâneas leriam `attempts = 0` e cada uma
 * ganharia um palpite. Com ela, cada valor de `attempts` decide uma vez; quem
 * perde recebe `false` e o endpoint descarta o resultado (inclusive um acerto).
 */
export async function gravarOtpSe(
  db: Client,
  tenantId: string,
  userId: string,
  e: EstadoOtp,
  anterior: { tentativas: number; codeHash: string },
): Promise<boolean> {
  const { data, error } = await db
    .from('gestao_otp')
    .update(colunasOtp(e))
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('attempts', anterior.tentativas)
    // Um código novo emitido no meio também invalida a decisão tomada sobre o velho.
    .eq('code_hash', anterior.codeHash)
    .is('consumed_at', null)
    .select('user_id')
  if (error) throw error
  return (data ?? []).length > 0
}

export async function marcarSessaoVerificada(db: Client, tenantId: string, userId: string, sessionId: string): Promise<void> {
  const { error } = await db
    .from('gestao_sessions')
    .upsert(
      { session_id: sessionId, tenant_id: tenantId, user_id: userId, verified_at: new Date().toISOString() },
      { onConflict: 'session_id,tenant_id' },
    )
  if (error) throw error
}

/** A sessão do JWT cumpriu o 2º fator NESTE tenant, para ESTE usuário? */
export async function sessaoVerificada(db: Client, tenantId: string, userId: string, sessionId: string): Promise<boolean> {
  const { data, error } = await db
    .from('gestao_sessions')
    .select('session_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function contarFalhasDesde(db: Client, tenantId: string, chave: string, desde: number): Promise<number> {
  const { count, error } = await db
    .from('gestao_login_falhas')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('chave', chave)
    .gte('created_at', new Date(desde).toISOString())
  if (error) throw error
  return count ?? 0
}

/** Registra a falha e apaga as com mais de um dia deste tenant: a tabela é de contagem, não de histórico. */
export async function registrarFalhas(db: Client, tenantId: string, chaves: string[], agora: number): Promise<void> {
  const { error } = await db.from('gestao_login_falhas').insert(chaves.map((chave) => ({ tenant_id: tenantId, chave })))
  if (error) throw error
  const velhas = await db
    .from('gestao_login_falhas')
    .delete()
    .eq('tenant_id', tenantId)
    .lt('created_at', new Date(agora - 24 * 60 * 60 * 1000).toISOString())
  if (velhas.error) logWarn('gestao.falhas_limpeza', { tenant: tenantId, reason: errMessage(velhas.error) })
}

/**
 * Retenção dos controles de acesso do /gestao. Código vencido não serve a ninguém; sessão verificada
 * muito antiga só é apagada depois de `sessaoAntesDe` (o custo de apagar cedo é pedir o código de novo
 * a quem ainda estava logado, então o prazo é folgado). `gestao_login_falhas` já se limpa ao gravar.
 */
export async function purgeAcessoAntigo(db: Client, codigosAntesDe: string, sessoesAntesDe: string): Promise<void> {
  const otp = await db.from('gestao_otp').delete().lt('expires_at', codigosAntesDe)
  if (otp.error) throw otp.error
  const sessoes = await db.from('gestao_sessions').delete().lt('verified_at', sessoesAntesDe)
  if (sessoes.error) throw sessoes.error
}
