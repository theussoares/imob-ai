import { consultar } from '~~/server/utils/gestao-leituras'

/** Faz uma consulta cadastral SIMULADA. Só quem tem `consulta`; ator e hora vêm do servidor. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const consulta = await consultar(ctx, await readBody(event))
  setResponseStatus(event, 201)
  return { consulta }
})
