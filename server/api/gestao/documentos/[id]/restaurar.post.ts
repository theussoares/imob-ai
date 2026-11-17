import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { auditarDocumento } from '~~/server/utils/gestao-documento-evento'
import { restaurarDocumentoGestao } from '~~/server/utils/gestao-documentos'

/** Tira da lixeira (`apagarDocs`). */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'apagarDocs')
  const id = idDeRota(getRouterParam(event, 'id'))
  const doc = await restaurarDocumentoGestao(ctx, id)
  await auditarDocumento(ctx, 'Restaurou o documento da lixeira', doc.id)
  return doc
})
