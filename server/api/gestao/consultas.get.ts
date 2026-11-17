import { consultas } from '~~/server/utils/gestao-leituras'

/** Histórico de consultas cadastrais (documento só mascarado). Só quem tem `consulta`. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  return { consultas: await consultas(ctx) }
})
