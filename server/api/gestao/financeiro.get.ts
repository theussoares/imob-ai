import { financeiro } from '~~/server/utils/gestao-leituras'

/** Financeiro (vendas e locações). Só quem tem `valores`; `?competencia=AAAA-MM` filtra os aluguéis. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const c = getQuery(event).competencia
  return financeiro(ctx, typeof c === 'string' ? c : '')
})
