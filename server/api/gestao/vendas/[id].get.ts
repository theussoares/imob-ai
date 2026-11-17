import { lerVendaDoMembro, idDeVenda } from '~~/server/utils/gestao-vendas'

/** Um processo de venda. De outro corretor (ou inexistente): 404, sem distinguir. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const id = idDeVenda(getRouterParam(event, 'id'))
  return lerVendaDoMembro(ctx, id)
})
