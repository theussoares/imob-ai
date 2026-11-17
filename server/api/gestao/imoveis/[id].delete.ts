import { excluirImovel } from '~~/server/utils/gestao-imoveis'

export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  return excluirImovel(await contextoImoveis(event), id)
})
