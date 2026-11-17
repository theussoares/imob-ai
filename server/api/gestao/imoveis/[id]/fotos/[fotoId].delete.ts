import { removerFotoImovel } from '~~/server/utils/gestao-imoveis'

export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  const fotoId = idDeRota(getRouterParam(event, 'fotoId'), 'ID da foto')
  return removerFotoImovel(await contextoImoveis(event), id, fotoId)
})
