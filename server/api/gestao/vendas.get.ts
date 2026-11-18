import { lerPagina } from '~~/layers/gestao/domain/paginacao'
import { STATUS_VENDA } from '~~/layers/gestao/domain/status'
import { listarVendasDoMembro, listarVendasPaginaDoMembro } from '~~/server/utils/gestao-vendas'

/**
 * Vendas do membro logado. `?arquivados=1` lista os arquivados.
 *
 * Sem `pagina`, devolve o array das 200 mais recentes (o que o store carrega ao abrir).
 * Com `pagina`, devolve `{ itens, total, pagina, porPagina, paginas, truncado }`, filtrado por
 * `?q=` (busca livre) e `?status=`. Escopo (tenant, corretor) e recorte de `valores` são
 * aplicados em `gestao-vendas.ts`; da query vêm só filtros, nunca tenant ou corretor.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const q = getQuery(event)
  const arquivados = q.arquivados === '1'
  if (q.pagina === undefined) return listarVendasDoMembro(ctx, { arquivados })

  const status = typeof q.status === 'string' ? q.status : ''
  if (status && !(STATUS_VENDA as readonly string[]).includes(status)) {
    throw createError({ statusCode: 422, statusMessage: 'Status inválido.' })
  }
  const busca = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : ''
  return listarVendasPaginaDoMembro(ctx, { arquivados, pagina: lerPagina(q.pagina), q: busca, status })
})
