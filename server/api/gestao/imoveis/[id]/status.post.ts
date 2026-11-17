import { mudarStatus } from '~~/server/utils/gestao-imoveis'

export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ status?: unknown }>(event)
  return mudarStatus(await contextoImoveis(await requireGestaoMember(event)), id, body?.status)
})
