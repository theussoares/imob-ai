import { atualizarImovel } from '~~/server/utils/gestao-imoveis'

/** `expectedUpdatedAt` no corpo liga a trava de concorrência do `updateProperty` (409 se outra pessoa salvou antes). */
export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  return atualizarImovel(await contextoImoveis(await requireGestaoMember(event)), id, await readBody(event))
})
