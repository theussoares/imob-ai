import { requireGestaoMember } from '~~/server/utils/gestao-auth'
import { listarDocumentos } from '~~/server/utils/gestao-documentos'

/** Documentos de UM processo/locação: `?alvo=venda:<id>` ou `?alvo=locacao:<id>`. Fora da lixeira. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  return listarDocumentos(ctx, getQuery(event).alvo)
})
