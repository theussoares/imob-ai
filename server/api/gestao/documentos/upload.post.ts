import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { auditarDocumento } from '~~/server/utils/gestao-documento-evento'
import { iniciarEnvio } from '~~/server/utils/gestao-documentos'

/**
 * Passo 1 do envio: `{ alvo, nome, tamanho, mime, categoria?, requisito?, documentoId? }` →
 * `{ documentoId, uploadUrl, token, versao }`. O caminho do objeto é do servidor; o corpo não
 * tem campo de caminho, de tenant nem de autor.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'enviarDocs')
  const envio = await iniciarEnvio(ctx, await readBody(event))
  await auditarDocumento(ctx, envio.versao > 1 ? 'Iniciou o envio de nova versão' : 'Iniciou o envio de documento', envio.documentoId)
  return envio
})
