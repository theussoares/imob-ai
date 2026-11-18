import { lerPagina } from '~~/layers/gestao/domain/paginacao'
import { STATUS_LOCACAO } from '~~/layers/gestao/domain/locacao-status'
import { listar, listarPagina } from '~~/server/utils/gestao-locacao-servico'

/**
 * Locações visíveis ao membro (corretor: só as suas). `?arquivadas=1` exige poder ver arquivados.
 * Sem `pagina`: `{ locacoes }` com as 200 mais recentes. Com `pagina`: `{ itens, total, pagina,
 * porPagina, paginas, truncado }`, filtrado por `?q=` e `?status=`.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const q = getQuery(event)
  const arquivadas = q.arquivadas === '1'
  if (q.pagina === undefined) return { locacoes: await listar(ctx, arquivadas) }

  const status = typeof q.status === 'string' ? q.status : ''
  if (status && !(STATUS_LOCACAO as readonly string[]).includes(status)) {
    throw createError({ statusCode: 422, statusMessage: 'Status inválido.' })
  }
  const busca = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : ''
  return listarPagina(ctx, { arquivadas, pagina: lerPagina(q.pagina), q: busca, status })
})
