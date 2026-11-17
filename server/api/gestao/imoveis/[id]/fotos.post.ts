import { adicionarFotosImovel } from '~~/server/utils/gestao-imoveis'

/** Corpo `{ fotos: [{ url, urlSm, alt }] }` com data URLs (as duas versões do `resizeForUpload`), até 4 por envio. */
export default defineEventHandler(async (event) => {
  const id = idDeRota(getRouterParam(event, 'id'))
  return adicionarFotosImovel(await contextoImoveis(await requireGestaoMember(event)), id, await readBody(event))
})
