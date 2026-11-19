import type { ContextoGestao } from '~~/server/utils/gestao-auth'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'

/**
 * Auditoria de matriz e configurações. A escrita já valeu quando isto roda: devolver 500 por
 * falha de auditoria faria o Dono repetir uma alteração que foi aplicada. Vendas, locações e
 * documentos já seguem assim (log e segue); estes dois endpoints eram os únicos que não.
 */
export async function auditarConfig(ctx: ContextoGestao, acao: string, alvoId: 'matriz' | 'config'): Promise<void> {
  try {
    await registrarEvento(ctx.db, ctx.tenant.id, {
      atorUserId: ctx.membro.userId,
      atorNome: ctx.membro.nome,
      acao,
      alvoTipo: 'config',
      alvoId,
    })
  } catch (e) {
    logError('gestao_evento_falhou', { tenantId: ctx.tenant.id, acao, erro: errMessage(e) })
  }
}
