import { obterImovel } from '~~/server/utils/gestao-imoveis'

export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  return obterImovel(await contextoImoveis(await requireGestaoMember(event)), id)
})
