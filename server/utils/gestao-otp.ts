import { createHmac } from 'node:crypto'
import {
  CODIGO_BLOQUEIO_MS,
  CODIGO_MAX_TENTATIVAS,
  CODIGO_REENVIO_MS,
  iguaisConstante,
} from '~~/layers/gestao/domain/auth'

/**
 * Regras do 2º fator do /gestao no servidor, PURAS: relógio e estado entram por
 * parâmetro, como em `layers/gestao/domain/auth.ts` (de onde vêm as constantes —
 * a tela do demo e o servidor contam o mesmo prazo). A gravação mora em
 * `gestao-acesso.repository.ts`; aqui só se decide.
 *
 * Duas diferenças deliberadas em relação ao demo, ambas registradas no plano da F1:
 *  - o hash é HMAC com o pepper do servidor e leva tenant + usuário na mensagem;
 *  - pedir código novo NÃO zera as tentativas.
 */

export interface EstadoOtp {
  codeHash: string
  expiraEm: number
  tentativas: number
  bloqueadoAte: number | null
  enviadoEm: number
  consumidoEm: number | null
}

/**
 * HMAC-SHA256 em vez de SHA-256 puro: o código tem 10⁶ valores, e um dump de
 * `gestao_otp` quebraria qualquer hash sem segredo em segundos. Tenant e usuário
 * entram na mensagem para que o código emitido para outra conta (ou para a mesma
 * pessoa em outra imobiliária) nunca case, mesmo se alguém trocasse a linha.
 */
export function hashCodigoOtp(pepper: string, tenantId: string, userId: string, codigo: string): string {
  return createHmac('sha256', pepper).update(`otp:${tenantId}:${userId}:${codigo}`).digest('hex')
}

/** Hash do token do convite. O token tem 256 bits: o HMAC aqui só impede que o dump vire link. */
export function hashTokenConvite(pepper: string, token: string): string {
  return createHmac('sha256', pepper).update(`convite:${token}`).digest('hex')
}

/**
 * Chave de contagem de falhas de login, sem o e-mail nem o IP em claro: a tabela
 * de falhas é de contagem, não de rastreio de quem tentou.
 */
export function chaveDeFalha(pepper: string, tipo: 'conta' | 'ip' | 'recuperar-conta' | 'recuperar-ip' | 'redefinir-ip', valor: string): string {
  return createHmac('sha256', pepper).update(`falha:${tipo}:${valor.trim().toLowerCase()}`).digest('hex')
}

/**
 * Pepper do servidor. Sem ele, em produção, falha fechado: um hash de código sem
 * segredo é o mesmo que guardar o código. Fora de produção usa um valor fixo,
 * para o fluxo rodar em dev sem configurar nada.
 */
export function pepperDoOtp(): string {
  const p = segredoDeRuntime(useRuntimeConfig().gestaoOtpPepper, 'GESTAO_OTP_PEPPER')
  if (p) return p
  if (process.env.NODE_ENV === 'production') {
    logError('config.gestao_pepper_ausente', {})
    throw createError({ statusCode: 500, statusMessage: 'Acesso ao painel não configurado.' })
  }
  return 'dev-gestao-pepper'
}

const minutos = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))
const msgBloqueio = (ms: number) =>
  `Muitas tentativas. Tente de novo em ${minutos(ms)} ${minutos(ms) === 1 ? 'minuto' : 'minutos'}.`

const bloqueado = (e: EstadoOtp, agora: number) => e.bloqueadoAte !== null && agora < e.bloqueadoAte

export type DecisaoEnvio =
  | { ok: true; tentativas: number }
  | { ok: false; motivo: 'bloqueado' | 'aguarde'; erro: string; segundos: number }

/**
 * Pode sair um código novo? E com quantas tentativas já gastas?
 *
 * As tentativas só zeram com acerto (`consumidoEm`) ou com o fim do bloqueio. O
 * demo zerava a cada código: com isso, quem já sabe a senha faria login, gastaria
 * 4 palpites, faria login de novo e ganharia mais 4 — sem limite nenhum.
 */
export function decidirEnvioOtp(atual: EstadoOtp | null, agora: number): DecisaoEnvio {
  if (!atual) return { ok: true, tentativas: 0 }
  if (bloqueado(atual, agora)) {
    const ms = atual.bloqueadoAte! - agora
    return { ok: false, motivo: 'bloqueado', erro: msgBloqueio(ms), segundos: Math.ceil(ms / 1000) }
  }
  if (atual.consumidoEm !== null) return { ok: true, tentativas: 0 }
  const espera = Math.ceil((atual.enviadoEm + CODIGO_REENVIO_MS - agora) / 1000)
  if (espera > 0) return { ok: false, motivo: 'aguarde', erro: `Aguarde ${espera} s para pedir outro código.`, segundos: espera }
  const bloqueioVencido = atual.bloqueadoAte !== null
  return { ok: true, tentativas: bloqueioVencido ? 0 : atual.tentativas }
}

export interface DecisaoVerificacao {
  ok: boolean
  motivo?: 'inexistente' | 'expirado' | 'bloqueado' | 'invalido'
  erro?: string
  segundos?: number
  restantes?: number
  /** Estado a gravar. Ausente = nada muda (e nada deve ser gravado). */
  novo?: EstadoOtp
}

/**
 * Confere o hash do código digitado contra o estado. Devolve o estado novo
 * inclusive na falha: contar o erro É a mudança que precisa ser gravada.
 */
export function decidirVerificacaoOtp(
  original: EstadoOtp | null,
  hashInformado: string,
  agora: number,
  bloqueioMs: number = CODIGO_BLOQUEIO_MS,
): DecisaoVerificacao {
  if (!original || original.consumidoEm !== null) {
    return { ok: false, motivo: 'inexistente', erro: 'Código inválido ou expirado. Peça um novo.' }
  }
  // Bloqueio vencido zera o contador; sem isso o 1º erro depois do prazo rebloquearia.
  const atual =
    original.bloqueadoAte !== null && agora >= original.bloqueadoAte
      ? { ...original, tentativas: 0, bloqueadoAte: null }
      : original

  // Antes da comparação: certo e errado recebem a mesma resposta durante o bloqueio.
  if (bloqueado(atual, agora)) {
    const ms = atual.bloqueadoAte! - agora
    return { ok: false, motivo: 'bloqueado', erro: msgBloqueio(ms), segundos: Math.ceil(ms / 1000) }
  }
  if (agora >= atual.expiraEm) return { ok: false, motivo: 'expirado', erro: 'Este código expirou. Peça um novo.' }

  if (iguaisConstante(hashInformado, atual.codeHash)) {
    return { ok: true, novo: { ...atual, tentativas: 0, consumidoEm: agora } }
  }

  const tentativas = atual.tentativas + 1
  if (tentativas >= CODIGO_MAX_TENTATIVAS) {
    return {
      ok: false,
      motivo: 'bloqueado',
      erro: msgBloqueio(bloqueioMs),
      segundos: Math.ceil(bloqueioMs / 1000),
      restantes: 0,
      novo: { ...atual, tentativas, bloqueadoAte: agora + bloqueioMs },
    }
  }
  return {
    ok: false,
    motivo: 'invalido',
    erro: 'Código incorreto.',
    restantes: CODIGO_MAX_TENTATIVAS - tentativas,
    novo: { ...atual, tentativas },
  }
}
