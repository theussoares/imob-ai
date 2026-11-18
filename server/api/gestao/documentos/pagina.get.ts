import { CATEGORIAS } from '~~/layers/gestao/domain/documentos'
import { lerPagina } from '~~/layers/gestao/domain/paginacao'
import { paginaDeDocumentos } from '~~/server/utils/gestao-documentos-pagina'

const ABAS = ['documentos', 'lixeira', 'sem-pdf'] as const
const CHAVES = CATEGORIAS.map((c) => c.chave) as string[]
const ID_CONTRATO = /^[VL]-\d{4}-\d{4,}$/
/** Vazio = sem filtro. Fora do formato (V-… ou L-…) dá o mesmo 404 de «não existe». */
function idDoContrato(v: string): string | null {
  if (!v) return null
  if (!ID_CONTRATO.test(v)) throw createError({ statusCode: 404, statusMessage: 'Não encontrado.' })
  return v
}
const um = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Uma página da tela Documentos: `?aba=documentos|lixeira|sem-pdf&categoria=&q=&processo=V-…|L-…&pagina=N`.
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
    processo: idDoContrato(um(q.processo)),
    pagina: lerPagina(q.pagina),
  })
})
