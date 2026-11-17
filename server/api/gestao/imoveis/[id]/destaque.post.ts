import { definirDestaqueImovel } from '~~/server/utils/gestao-imoveis'

export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ featured?: unknown }>(event)
  return definirDestaqueImovel(await contextoImoveis(event), id, body?.featured)
})
