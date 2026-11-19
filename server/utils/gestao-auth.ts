import type { H3Event } from 'h3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant } from '~~/shared/models/tenant'
import type { MatrizPermissoes, PermChave, PermValor, Perfil, Sessao } from '~~/layers/gestao/domain/types'
import { CODIGO_REENVIO_MS, CODIGO_VALIDADE_MS, gerarCodigo } from '~~/layers/gestao/domain/auth'
import { buscarMembroPorUsuario } from '~~/server/repositories/gestao-member.repository'
import { lerSettings } from '~~/server/repositories/gestao-settings.repository'
import {
  contarFalhasDesde,
  gravarOtpNovoSe,
  gravarOtpSe,
  lerOtp,
  marcarSessaoVerificada,
  registrarFalhas,
  sessaoVerificada,
} from '~~/server/repositories/gestao-acesso.repository'
import { emailCodigoGestao } from '~~/server/utils/email-templates'
import { enviarEmail } from '~~/server/utils/mailer'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import { decidirEnvioOtp, decidirVerificacaoOtp, hashCodigoOtp, type DecisaoVerificacao } from '~~/server/utils/gestao-otp'

type Client = SupabaseClient<Database>

/**
 * Autenticação do painel de gestão (/gestao) no servidor.
 *
 * Por que não `requireTenantMember`: aquele abre o /admin (`tenant_members`), e
 * corretor e recepção do gestão não podem herdar o /admin. Aqui o vínculo é
 * `gestao_members`, o perfil e o corretor saem do BANCO (nunca do body), o
 * recurso `gestao` do tenant é conferido no servidor e o 2º fator precisa ter
 * sido cumprido pela sessão do JWT.
 *
 * Contratos consumidos pelas fases F2–F7 (plano 2026-11-17-gestao-backend.md):
 * `MembroGestao`, `ContextoGestao`, `requireGestaoMember`, `exigirPermissao`.
 */

export interface MembroGestao {
  id: string
  userId: string
  tenantId: string
  nome: string
  perfil: Perfil
  brokerId: string | null
}

export interface ContextoGestao {
  membro: MembroGestao
  tenant: Tenant
  sessao: Sessao
  matriz: MatrizPermissoes
  db: Client
}

/** Membro autenticado ANTES do contexto completo. É o que os endpoints do 2º fator recebem. */
export interface AcessoGestao {
  membro: MembroGestao
  tenant: Tenant
  /** `session_id` do JWT do Supabase: o que o 2º fator marca como verificada. */
  sessionId: string
  /** Para onde vai o código. Do Supabase Auth, nunca do body. */
  email: string
  db: Client
}

const naoAutenticado = (statusMessage: string, data?: Record<string, unknown>) =>
  createError({ statusCode: 401, statusMessage, data })

export function tokenBearer(authorization: string | null | undefined): string {
  const h = authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `session_id` do payload do JWT. Lido SEM verificar a assinatura — e por isso só
 * pode ser chamado depois de `auth.getUser(token)` ter aceitado o token: é o
 * Supabase quem verifica; aqui só se lê o que ele já validou.
 */
export function sessionIdDoJwt(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { session_id?: unknown }
    return typeof claims.session_id === 'string' && UUID.test(claims.session_id) ? claims.session_id : null
  } catch {
    return null
  }
}

/**
 * Núcleo testável da autenticação: tudo o que vem do evento entra por parâmetro.
 *
 * Ordem deliberada:
 *  1. recurso desligado → 404 antes de olhar o token: para essa imobiliária o
 *     painel não existe, como em `exigirCobranca`;
 *  2. sem token, token recusado, sem `session_id` → 401;
 *  3. sem vínculo NESTE tenant (removido, ou membro de outra imobiliária) → 401,
 *     a cada requisição — remover alguém corta o acesso na chamada seguinte;
 *  4. sessão sem 2º fator → 401 com `motivo: 'segundo_fator'`, para a tela
 *     mandar ao código em vez do login.
 */
export async function resolverAcessoGestao(
  d: { db: Client; tenant: Tenant; token: string; recursoAtivo: (tenantId: string) => Promise<boolean> },
  opts: { segundoFator: boolean },
): Promise<AcessoGestao> {
  if (!(await d.recursoAtivo(d.tenant.id))) {
    throw createError({ statusCode: 404, statusMessage: 'Página não encontrada.' })
  }
  if (!d.token) {
    logWarn('gestao.auth_recusada', { reason: 'missing_token', tenant: d.tenant.slug })
    throw naoAutenticado('Não autenticado.')
  }

  const { data, error } = await d.db.auth.getUser(d.token)
  const user = data?.user
  if (error || !user) {
    logWarn('gestao.auth_recusada', { reason: 'invalid_token', tenant: d.tenant.slug, detail: error?.message })
    throw naoAutenticado('Sessão inválida ou expirada.')
  }
  const sessionId = sessionIdDoJwt(d.token)
  if (!sessionId) {
    logWarn('gestao.auth_recusada', { reason: 'no_session_id', tenant: d.tenant.slug })
    throw naoAutenticado('Sessão inválida ou expirada.')
  }

  const membro = await buscarMembroPorUsuario(d.db, d.tenant.id, user.id)
  if (!membro) {
    logWarn('gestao.auth_recusada', { reason: 'not_member', tenant: d.tenant.slug })
    throw naoAutenticado('Sessão inválida ou expirada.')
  }

  if (opts.segundoFator && !(await sessaoVerificada(d.db, d.tenant.id, user.id, sessionId))) {
    throw naoAutenticado('Confirme o código enviado por e-mail.', { motivo: 'segundo_fator' })
  }

  return { membro, tenant: d.tenant, sessionId, email: user.email ?? '', db: d.db }
}

/** Autenticação a partir do evento. Sem 2º fator só nos endpoints que o cumprem (código, reenvio). */
export function acessoGestao(event: H3Event, opts: { segundoFator: boolean }): Promise<AcessoGestao> {
  return resolverAcessoGestao(
    {
      db: serviceSupabase(),
      tenant: useTenantContext(event),
      token: tokenBearer(getHeader(event, 'authorization')),
      recursoAtivo: gestaoAtiva,
    },
    opts,
  )
}

export async function montarContexto(a: AcessoGestao): Promise<ContextoGestao> {
  const { matriz } = await lerSettings(a.db, a.tenant.id)
  return {
    membro: a.membro,
    tenant: a.tenant,
    sessao: { perfil: a.membro.perfil, nome: a.membro.nome, corretorId: a.membro.brokerId },
    matriz,
    db: a.db,
  }
}

/** 401 sem token/2º fator; 404 se o recurso `gestao` está desligado no tenant. */
export async function requireGestaoMember(event: H3Event): Promise<ContextoGestao> {
  return montarContexto(await acessoGestao(event, { segundoFator: true }))
}

export function valorPermissao(ctx: Pick<ContextoGestao, 'matriz' | 'membro'>, chave: PermChave): PermValor {
  return ctx.matriz[chave]?.[ctx.membro.perfil] ?? 'nao'
}

/**
 * 403 quando a matriz diz `nao`. `proprio` PASSA: o recorte "só os seus" é do
 * endpoint (filtro por `brokerId`), que sabe sobre o que está agindo.
 */
export function exigirPermissao(ctx: ContextoGestao, chave: PermChave): void {
  if (valorPermissao(ctx, chave) === 'nao') {
    throw createError({ statusCode: 403, statusMessage: 'Seu perfil não tem permissão para isso.' })
  }
}

// --- 2º fator ----------------------------------------------------------------

export type EnvioCodigo = { enviado: true; segundos: number } | { enviado: false; motivo: 'bloqueado' | 'aguarde'; erro: string; segundos: number }

/**
 * Emite e envia um código, se as regras deixarem (`decidirEnvioOtp`).
 *
 * Envia ANTES de gravar: se o e-mail falha, nada muda no banco e a pessoa pode
 * tentar de novo na hora. Na ordem inversa, um envio que falhasse deixaria a
 * espera de 60 s valendo para um código que nunca chegou. O preço da ordem é a
 * gravação ter de ser condicional (`gravarOtpNovoSe`).
 */
export async function emitirCodigoGestao(
  db: Client,
  o: { tenantId: string; userId: string; agora: number; pepper: string; enviar: (codigo: string) => Promise<void> },
): Promise<EnvioCodigo> {
  const atual = await lerOtp(db, o.tenantId, o.userId)
  const decisao = decidirEnvioOtp(atual, o.agora)
  if (!decisao.ok) return { enviado: false, motivo: decisao.motivo, erro: decisao.erro, segundos: decisao.segundos }

  const codigo = gerarCodigo()
  await o.enviar(codigo)
  const gravou = await gravarOtpNovoSe(db, o.tenantId, o.userId, {
    codeHash: hashCodigoOtp(o.pepper, o.tenantId, o.userId, codigo),
    expiraEm: o.agora + CODIGO_VALIDADE_MS,
    tentativas: decisao.tentativas,
    bloqueadoAte: null,
    enviadoEm: o.agora,
    consumidoEm: null,
  }, atual)
  // O código que saiu no e-mail não vale: alguém tentou (ou pediu outro) durante o envio.
  if (!gravou) throw createError({ statusCode: 409, statusMessage: 'Outra tentativa foi feita ao mesmo tempo. Peça o código de novo.' })
  return { enviado: true, segundos: CODIGO_REENVIO_MS / 1000 }
}

/**
 * Confere o código e, se certo, marca a sessão do JWT como verificada NESTE tenant.
 * O hash leva tenant e usuário: código de outra conta nunca casa.
 */
export async function conferirCodigoGestao(
  db: Client,
  o: { tenantId: string; userId: string; sessionId: string; codigo: string; agora: number; pepper: string },
): Promise<DecisaoVerificacao> {
  const codigo = o.codigo.trim()
  if (!/^\d{6}$/.test(codigo)) {
    // Formato errado não gasta tentativa: é erro de digitação, não palpite.
    throw createError({ statusCode: 422, statusMessage: 'O código tem 6 números.' })
  }
  const atual = await lerOtp(db, o.tenantId, o.userId)
  const r = decidirVerificacaoOtp(atual, hashCodigoOtp(o.pepper, o.tenantId, o.userId, codigo), o.agora)
  if (r.novo && atual) {
    const gravou = await gravarOtpSe(db, o.tenantId, o.userId, r.novo, atual)
    if (!gravou) {
      throw createError({ statusCode: 409, statusMessage: 'Outra tentativa foi feita ao mesmo tempo. Tente de novo.' })
    }
  }
  if (r.ok) await marcarSessaoVerificada(db, o.tenantId, o.userId, o.sessionId)
  return r
}

// --- Limite de login ---------------------------------------------------------

export const FALHAS_POR_CONTA = 5
export const FALHAS_POR_IP = 20
export const JANELA_FALHAS_MS = 15 * 60 * 1000

/**
 * Barra o login depois de muitas falhas pela conta OU pelo IP, na janela de
 * 15 min. Mensagem única nos dois casos, e a mesma com ou sem conta: não pode
 * virar jeito de descobrir quais e-mails existem.
 */
export async function exigirLimiteLogin(
  db: Client,
  tenantId: string,
  chaves: { conta: string; ip: string | null },
  agora: number,
): Promise<void> {
  const desde = agora - JANELA_FALHAS_MS
  const conta = await contarFalhasDesde(db, tenantId, chaves.conta, desde)
  const ip = chaves.ip ? await contarFalhasDesde(db, tenantId, chaves.ip, desde) : 0
  if (conta >= FALHAS_POR_CONTA || ip >= FALHAS_POR_IP) {
    logWarn('gestao.login_limitado', { tenant: tenantId, porConta: conta >= FALHAS_POR_CONTA })
    throw createError({ statusCode: 429, statusMessage: 'Muitas tentativas. Tente de novo em alguns minutos.' })
  }
}

export function registrarFalhaLogin(db: Client, tenantId: string, chaves: { conta: string; ip: string | null }, agora: number) {
  return registrarFalhas(db, tenantId, chaves.ip ? [chaves.conta, chaves.ip] : [chaves.conta], agora)
}

// --- Login, e-mail do código, resposta de sessão ------------------------------

/**
 * Client com a anon key, novo por chamada e sem guardar sessão: é só para o
 * `signInWithPassword` do login (e da prova de senha no aceite). A service_role
 * não serve aqui — ela entraria sem senha nenhuma.
 */
export function clienteDeLogin(): Client {
  const config = useRuntimeConfig()
  return createClient<Database>(
    segredoDeRuntime(config.public.supabaseUrl, 'SUPABASE_URL'),
    segredoDeRuntime(config.public.supabaseKey, 'SUPABASE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** E-mail do código, com o remetente do tenant. `rotuloDeLog` porque o assunto vai para o log se o envio falhar. */
export async function enviarCodigoGestao(tenant: Tenant, para: string, codigo: string): Promise<void> {
  const corpo = emailCodigoGestao({ nomeImobiliaria: tenant.name, codigo })
  await enviarEmail({
    para,
    ...corpo,
    rotuloDeLog: 'gestao.codigo',
    remetente: { nome: tenant.name, endereco: await remetenteDoTenant(tenant), replyTo: tenant.email },
  })
}

/** O que a tela precisa para montar o painel depois do login (e a cada recarga). */
export function respostaSessao(ctx: ContextoGestao) {
  const { membro } = ctx
  return {
    membro: { id: membro.id, nome: membro.nome, perfil: membro.perfil, brokerId: membro.brokerId },
    sessao: ctx.sessao,
    matriz: ctx.matriz,
  }
}
