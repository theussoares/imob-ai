import { exigirPermissao, requireGestaoMember } from '~~/server/utils/gestao-auth'
import { listarDocumentosApagados } from '~~/server/utils/gestao-documentos'

/** Lixeira (`apagarDocs`). Sem `?alvo=`, só o que o perfil enxerga: corretor vê a dos próprios processos. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  exigirPermissao(ctx, 'apagarDocs')
  return listarDocumentosApagados(ctx, getQuery(event).alvo)
})
