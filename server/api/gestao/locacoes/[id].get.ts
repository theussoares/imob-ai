import { idDeLocacao, ler } from '~~/server/utils/gestao-locacao-servico'

/** Uma locação. Id de outro corretor ou de outro tenant responde 404, igual a id inexistente. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  return ler(ctx, idDeLocacao(getRouterParam(event, 'id')))
})
