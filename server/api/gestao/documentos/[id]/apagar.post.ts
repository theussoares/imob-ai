import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { auditarDocumento } from '~~/server/utils/gestao-documento-evento'
import { apagarDocumentoGestao } from '~~/server/utils/gestao-documentos'

/** Manda para a lixeira (`apagarDocs`); não exclui o arquivo. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'apagarDocs')
  const id = idDeRota(getRouterParam(event, 'id'))
  const doc = await apagarDocumentoGestao(ctx, id)
  await auditarDocumento(ctx, 'Apagou o documento (lixeira)', doc.id)
  return doc
})
