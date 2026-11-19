import { acessoGestao, emitirCodigoGestao, enviarCodigoGestao } from '~~/server/utils/gestao-auth'
import { pepperDoOtp } from '~~/server/utils/gestao-otp'

/**
 * Pede outro código. Exige o token do login (senha já provada), e as regras de
 * `decidirEnvioOtp`: 60 s entre envios e nada durante o bloqueio — sem isso, o
 * limite de 5 tentativas renasceria a cada reenvio.
 */
export default defineEventHandler(async (event) => {
  const a = await acessoGestao(event, { segundoFator: false })
  const envio = await emitirCodigoGestao(a.db, {
    tenantId: a.tenant.id,
    userId: a.membro.userId,
    agora: Date.now(),
    pepper: pepperDoOtp(),
    enviar: (codigo) => enviarCodigoGestao(a.tenant, a.email, codigo),
  })
  if (!envio.enviado) {
    throw createError({ statusCode: 429, statusMessage: envio.erro, data: { motivo: envio.motivo, segundos: envio.segundos } })
  }
  return { enviado: true as const, segundos: envio.segundos }
})
