import { listarVendasDoMembro } from '~~/server/utils/gestao-vendas'

/**
 * Lista de vendas do membro logado (até 200, mais recentes primeiro).
 * `?arquivados=1` lista os arquivados. Escopo (tenant, corretor) e recorte de
 * `valores` aplicados em `gestao-vendas.ts`; nada vem do corpo ou da query além
 * do filtro de arquivados.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const q = getQuery(event)
  return listarVendasDoMembro(ctx, { arquivados: q.arquivados === '1' })
})
