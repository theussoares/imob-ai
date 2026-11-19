import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'
import type { CtxDocs } from '~~/server/utils/gestao-documentos'

/**
 * Trilha de auditoria dos documentos (`gestao_eventos`, F1, append-only).
 *
 * `obrigatorio` = o evento é condição da ação: o DOWNLOAD só devolve a URL se o
 * registro de quem baixou foi gravado (RG e certidão; mesma lógica de
 * `recordDocumentAccess`, que no portal é o inverso — lá o cliente baixa o
 * PRÓPRIO documento). Nas demais ações o dado já mudou quando o evento é
 * gravado: falhar com 500 só faria a pessoa repetir uma ação feita, então
 * loga (sem PII) e segue.
 */
export async function auditarDocumento(
  ctx: CtxDocs & { membro: { userId: string } },
  acao: string,
  documentoId: string,
  opcoes: { obrigatorio?: boolean } = {},
): Promise<void> {
  try {
    await registrarEvento(
      ctx.db,
      ctx.membro.tenantId,
      { atorUserId: ctx.membro.userId, atorNome: ctx.membro.nome, acao, alvoTipo: 'documento', alvoId: documentoId },
      { obrigatorio: opcoes.obrigatorio },
    )
  } catch (e) {
    logError('gestao.documento.evento_falhou', { tenantId: ctx.membro.tenantId, documentoId, acao, motivo: errMessage(e) })
    if (opcoes.obrigatorio) throw createError({ statusCode: 500, statusMessage: 'Não foi possível registrar o acesso.' })
  }
}
