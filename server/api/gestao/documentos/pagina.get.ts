import { CATEGORIAS } from '~~/layers/gestao/domain/documentos'
import { lerPagina } from '~~/layers/gestao/domain/paginacao'
import { paginaDeDocumentos } from '~~/server/utils/gestao-documentos-pagina'
import { idDeVenda } from '~~/server/utils/gestao-vendas'

const ABAS = ['documentos', 'lixeira', 'sem-pdf'] as const
const CHAVES = CATEGORIAS.map((c) => c.chave) as string[]
const um = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Uma página da tela Documentos: `?aba=documentos|lixeira|sem-pdf&categoria=&q=&processo=V-…&pagina=N`.
 * Tudo da query é filtro; tenant e escopo do corretor saem da sessão. A lixeira exige `apagarDocs`.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const q = getQuery(event)
  const aba = um(q.aba) || 'documentos'
  const categoria = um(q.categoria) || 'todas'
  if (!(ABAS as readonly string[]).includes(aba)) throw createError({ statusCode: 422, statusMessage: 'Aba inválida.' })
  if (!CHAVES.includes(categoria)) throw createError({ statusCode: 422, statusMessage: 'Categoria inválida.' })
  return paginaDeDocumentos(ctx, {
    aba: aba as (typeof ABAS)[number],
    categoria: categoria as never,
    q: um(q.q).trim().slice(0, 100),
    processo: um(q.processo) ? idDeVenda(um(q.processo)) : null,
    pagina: lerPagina(q.pagina),
  })
})
