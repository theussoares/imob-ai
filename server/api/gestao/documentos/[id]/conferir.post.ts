import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { auditarDocumento } from '~~/server/utils/gestao-documento-evento'
import { conferirDocumentoGestao } from '~~/server/utils/gestao-documentos'

/** Marca como conferido (`conferir`). */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'conferir')
  const id = idDeRota(getRouterParam(event, 'id'))
  const doc = await conferirDocumentoGestao(ctx, id)
  await auditarDocumento(ctx, 'Conferiu o documento', doc.id)
  return doc
})
