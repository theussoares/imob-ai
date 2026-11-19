import { acessoGestao, conferirCodigoGestao, montarContexto, respostaSessao } from '~~/server/utils/gestao-auth'
import { pepperDoOtp } from '~~/server/utils/gestao-otp'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/**
 * 2º fator: confere o código e marca a sessão do JWT como verificada neste tenant.
 *
 * Usuário, tenant e sessão saem do token e do Host, nunca do body — o body só
 * traz o código. Bloqueio vira 429 (com os segundos), código errado 422 (com as
 * tentativas restantes), para a tela dizer o que fazer.
 */
export default defineEventHandler(async (event) => {
  const a = await acessoGestao(event, { segundoFator: false })
  const body = await readBody<{ codigo?: unknown }>(event)

  const r = await conferirCodigoGestao(a.db, {
    tenantId: a.tenant.id,
    userId: a.membro.userId,
    sessionId: a.sessionId,
    codigo: typeof body?.codigo === 'string' ? body.codigo : '',
    agora: Date.now(),
    pepper: pepperDoOtp(),
  })
  if (!r.ok) {
    throw createError({
      statusCode: r.motivo === 'bloqueado' ? 429 : 422,
      statusMessage: r.erro,
      data: { motivo: r.motivo, restantes: r.restantes, segundos: r.segundos },
    })
  }

  await registrarEvento(a.db, a.tenant.id, {
    atorUserId: a.membro.userId,
    atorNome: a.membro.nome,
    acao: 'Entrou no painel',
    alvoTipo: 'membro',
    alvoId: a.membro.id,
  })
  return respostaSessao(await montarContexto(a))
})
