import { filtroImoveisDaUrl } from '~~/layers/gestao/domain/imoveis-lista'
import { listarImoveis, listarImoveisPagina } from '~~/server/utils/gestao-imoveis'

/**
 * Imóveis do tenant (qualquer perfil vê todos).
 *
 * Sem `pagina`, devolve o array dos 200 mais recentes (o que o store carrega ao abrir).
 * Com `pagina`, devolve `{ itens, total, pagina, porPagina, paginas, truncado }` filtrado por `?q=`, `?status=`,
 * `?purpose=` e `?situacao=`; cada item leva a `situacao` calculada dos contratos do tenant. Valor de filtro fora
 * da lista é 422 (a tela só manda os que conhece). O tenant sai da sessão, nunca da query.
 */
export default defineEventHandler(async (event) => {
  const ctx = await contextoImoveis(await requireGestaoMember(event))
  const q = getQuery(event)
  if (q.pagina === undefined) return listarImoveis(ctx)

  const filtro = filtroImoveisDaUrl(q)
  const invalido = (['status', 'purpose', 'situacao'] as const).some((k) => typeof q[k] === 'string' && q[k] !== '' && filtro[k] === '')
  if (invalido) throw createError({ statusCode: 422, statusMessage: 'Filtro inválido.' })
  return listarImoveisPagina(ctx, filtro)
})
