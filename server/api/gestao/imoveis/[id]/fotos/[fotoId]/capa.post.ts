import { definirCapaImovel } from '~~/server/utils/gestao-imoveis'

export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  const fotoId = idDeRota(getRouterParam(event, 'fotoId'), 'ID da foto')
  return definirCapaImovel(await contextoImoveis(await requireGestaoMember(event)), id, fotoId)
})
