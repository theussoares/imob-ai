import { moverFotoImovel } from '~~/server/utils/gestao-imoveis'

export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  const fotoId = idDeRota(getRouterParam(event, 'fotoId'), 'ID da foto')
  const body = await readBody<{ direcao?: unknown }>(event)
  return moverFotoImovel(await contextoImoveis(await requireGestaoMember(event)), id, fotoId, body?.direcao)
})
