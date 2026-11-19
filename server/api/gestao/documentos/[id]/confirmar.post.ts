import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { auditarDocumento } from '~~/server/utils/gestao-documento-evento'
import { confirmarEnvio } from '~~/server/utils/gestao-documentos'

/** Passo 2 do envio: o servidor abre o objeto que ele mesmo localizou, confere formato e tamanho e grava a versão. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'enviarDocs')
  const id = idDeRota(getRouterParam(event, 'id'))
  const doc = await confirmarEnvio(ctx, id)
  await auditarDocumento(ctx, 'Confirmou o envio do documento', doc.id)
  return doc
})
