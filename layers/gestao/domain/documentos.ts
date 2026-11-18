import { lerPagina, paginar } from './paginacao'
import type { CategoriaDocumento, Documento, EstadoDocumento, Processo, StatusVenda } from './types'

/**
 * Regras da tela de documentos, como funções puras (mesmo motivo de `acoes.ts`:
 * dá para testar em Node sem subir o Nuxt). A tela só liga estas funções aos
 * controles.
 *
 * Visibilidade é decidida pelo chamador, que passa SÓ os processos visíveis à
 * sessão: um documento cujo processo não está nessa lista não existe para quem
 * pergunta. Alternativa descartada: checar `corretorId` aqui dentro — duplicaria
 * `processosVisiveis` e as duas regras divergiriam na primeira mudança de matriz.
 */

export type AbaDocumentos = 'documentos' | 'lixeira' | 'sem-pdf'

export type FiltroCategoria = CategoriaDocumento | 'todas'

export const CATEGORIAS: { chave: FiltroCategoria; rotulo: string }[] = [
  { chave: 'todas', rotulo: 'Todas' },
  { chave: 'pessoas', rotulo: 'Pessoas' },
  { chave: 'imoveis', rotulo: 'Imóveis' },
  { chave: 'venda', rotulo: 'Venda' },
  { chave: 'locacao', rotulo: 'Locação' },
  { chave: 'vistoria', rotulo: 'Vistoria' },
  { chave: 'financeiro', rotulo: 'Financeiro' },
]

export const ROTULO_CATEGORIA: Record<CategoriaDocumento, string> = {
  pessoas: 'Pessoas',
  imoveis: 'Imóveis',
  venda: 'Venda',
  locacao: 'Locação',
  vistoria: 'Vistoria',
  financeiro: 'Financeiro',
}

export const ROTULO_ESTADO: Record<EstadoDocumento, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  conferido: 'Conferido',
}

export interface FiltroDocumentos {
  categoria?: FiltroCategoria
  busca?: string
  /** Vem de `?processo=`: restringe tudo a um processo. */
  processoId?: string | null
}

/** Minúsculas e sem acento: «matricula» acha «Matrícula». */
function normaliza(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function doProcesso(processoId: string | null | undefined) {
  return (d: Documento) => !processoId || d.processoId === processoId
}

/** O que a lista de documentos precisa saber de um contrato (venda ou locação): o id e o imóvel. */
export interface AlvoDocumento {
  id: string
  imovel: string
}

/** Documento de contrato visível; sem isso o corretor veria arquivo de colega. */
function visivel(processos: AlvoDocumento[]) {
  const ids = new Set(processos.map((p) => p.id))
  return (d: Documento) => ids.has(d.processoId)
}

/**
 * Lista de uma aba. `documentos` = fora da lixeira; `lixeira` = só apagados.
 * A aba `sem-pdf` não lista documentos (ver `contratosSemPdf`) e devolve vazio
 * aqui para que o chamador nunca misture os dois tipos de item.
 */
export function filtrarDocumentos(
  documentos: Documento[],
  processos: AlvoDocumento[],
  aba: AbaDocumentos,
  filtro: FiltroDocumentos = {},
): Documento[] {
  if (aba === 'sem-pdf') return []
  const imovelDe = new Map(processos.map((p) => [p.id, p.imovel]))
  const termo = normaliza(filtro.busca ?? '')
  const categoria = filtro.categoria ?? 'todas'
  // Montados UMA vez: o servidor roda isto sobre até 5000 documentos × 5000 processos, e recriar o Set por
  // documento seria quadrático.
  const ehVisivel = visivel(processos)
  const ehDoProcesso = doProcesso(filtro.processoId)
  return documentos.filter((d) => {
    if (!ehVisivel(d) || !ehDoProcesso(d)) return false
    if ((aba === 'lixeira') !== (d.apagado !== null)) return false
    if (categoria !== 'todas' && d.categoria !== categoria) return false
    if (!termo) return true
    // Busca por documento, processo ou imóvel — o que a recepção tem à mão.
    return [d.nome, d.processoId, imovelDe.get(d.processoId) ?? ''].some((t) => normaliza(t).includes(termo))
  })
}

/**
 * Processos de venda visíveis sem contrato em PDF. Cancelada fica de fora:
 * ninguém vai anexar contrato a uma venda que não aconteceu, e o aviso viraria
 * ruído permanente.
 */
export function contratosSemPdf(
  processos: Processo[],
  filtro: Pick<FiltroDocumentos, 'busca' | 'processoId'> = {},
): Processo[] {
  const termo = normaliza(filtro.busca ?? '')
  return processos.filter((p) => {
    if (p.tipo !== 'venda' || p.pdf || p.status === 'Venda cancelada') return false
    if (filtro.processoId && p.id !== filtro.processoId) return false
    return !termo || [p.id, p.imovel].some((t) => normaliza(t).includes(termo))
  })
}

/**
 * Contagens das abas. Respeitam visibilidade e o filtro de processo, mas NÃO a
 * busca nem a categoria: o número da aba diz quanto existe, não quanto passou
 * pelo filtro (senão a aba «Lixeira (0)» esconderia itens ao digitar uma busca).
 */
export function contarAbas(
  documentos: Documento[],
  processos: Processo[],
  processoId?: string | null,
  locacoes: AlvoDocumento[] = [],
): Record<AbaDocumentos, number> {
  const base = { processoId }
  // Documento de locação conta nas abas Documentos e Lixeira; «Contratos sem PDF» é só de venda (locação não tem `pdf`).
  const alvos = [...processos, ...locacoes]
  return {
    documentos: filtrarDocumentos(documentos, alvos, 'documentos', base).length,
    lixeira: filtrarDocumentos(documentos, alvos, 'lixeira', base).length,
    'sem-pdf': contratosSemPdf(processos, base).length,
  }
}

/** «2,4 MB», «812 KB», «300 B» — decimal (1000), como o Finder e o Drive mostram. */
export function formatarTamanho(bytes: number): string {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  const fmt = (v: number, casas: number) => v.toFixed(casas).replace('.', ',')
  if (n < 1000) return `${n} B`
  if (n < 1e6) return `${Math.round(n / 1000)} KB`
  if (n < 1e9) return `${fmt(n / 1e6, 1)} MB`
  return `${fmt(n / 1e9, 1)} GB`
}

export type TipoArquivo = 'pdf' | 'imagem' | 'outro'

export function extensao(nome: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nome.trim())
  return m ? m[1]!.toLowerCase() : ''
}

export function tipoArquivo(nome: string): TipoArquivo {
  const e = extensao(nome)
  if (e === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(e)) return 'imagem'
  return 'outro'
}

/** Versões da mais nova para a mais antiga. O demo não guarda os arquivos antigos, só a contagem. */
export function listaVersoes(doc: Pick<Documento, 'versoes'>): { numero: number; total: number; atual: boolean }[] {
  const total = Math.max(1, doc.versoes)
  return Array.from({ length: total }, (_, i) => ({ numero: total - i, total, atual: i === 0 }))
}

/** Tipos aceitos no seletor de arquivo; a validação de verdade é de `enviarDocumento`. */
export const ACEITA_ARQUIVO = '.pdf,.jpg,.jpeg,.png,.webp'

const TIPOS_ACEITOS = /\.(pdf|jpe?g|png|webp)$/i
export const LIMITE_BYTES = 20 * 1024 * 1024

/**
 * Mesma regra de `enviarDocumento`, para a SUBSTITUIÇÃO — que em `acoes.ts` não
 * valida nada (recebe só o tamanho). Sem isto, dava para trocar um PDF por um
 * .exe de 50 MB. Alternativa descartada: editar `acoes.ts`, que não é desta tela;
 * quando a regra subir para o servidor, esta cópia some.
 */
export function validarArquivo(nome: string, tamanho: number): string | null {
  if (!TIPOS_ACEITOS.test(nome)) return 'Use PDF, JPG, PNG ou WEBP.'
  if (tamanho > LIMITE_BYTES) return 'O arquivo passa de 20 MB.'
  return null
}

// ---------------------------------------------------------------- lista paginada (URL)

/** O que a tela Documentos guarda na URL: `?aba=lixeira&categoria=imoveis&q=…&pagina=2&processo=V-…&de=processo`. */
export interface FiltroListaDocumentos {
  pagina: number
  q: string
  aba: AbaDocumentos
  categoria: FiltroCategoria
  /** Id de venda (V-…) ou locação (L-…); '' = todos. */
  processo: string
  /** `processo` = veio da tela do processo (o «voltar» leva para lá). Só vale com `processo`. */
  de: '' | 'processo'
}

/** Uma página da tela Documentos, do servidor (`http`) ou calculada aqui (`mock`). */
export interface PaginaDocumentos {
  itens: Documento[]
  contratos: { id: string; imovel: string; status: StatusVenda }[]
  total: number
  pagina: number
  porPagina: number
  paginas: number
  abas: Record<AbaDocumentos, number>
  imoveis: Record<string, string>
  truncado: boolean
}

const ABAS_VALIDAS: readonly AbaDocumentos[] = ['documentos', 'lixeira', 'sem-pdf']
const ID_CONTRATO_URL = /^[VL]-\d{4}-\d{4,}$/
const um = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')

/** URL → filtro. Valor inválido vira o padrão; a lixeira some da URL de quem não pode apagar documento. */
export function filtroDocumentosDaUrl(query: Record<string, unknown>, opcoes: { podeApagar: boolean }): FiltroListaDocumentos {
  const aba = um(query.aba) as AbaDocumentos
  const categoria = um(query.categoria) as FiltroCategoria
  const processo = ID_CONTRATO_URL.test(um(query.processo)) ? um(query.processo) : ''
  return {
    pagina: lerPagina(query.pagina),
    q: um(query.q).slice(0, 100),
    aba: ABAS_VALIDAS.includes(aba) && (aba !== 'lixeira' || opcoes.podeApagar) ? aba : 'documentos',
    categoria: CATEGORIAS.some((c) => c.chave === categoria) ? categoria : 'todas',
    processo,
    de: processo && um(query.de) === 'processo' ? 'processo' : '',
  }
}

/** Filtro → query, sem o que é padrão. */
export function queryDosDocumentos(f: FiltroListaDocumentos): Record<string, string> {
  const q = f.q.trim()
  return {
    ...(f.aba !== 'documentos' ? { aba: f.aba } : {}),
    ...(f.categoria !== 'todas' ? { categoria: f.categoria } : {}),
    ...(q ? { q } : {}),
    ...(f.pagina > 1 ? { pagina: String(f.pagina) } : {}),
    ...(f.processo ? { processo: f.processo } : {}),
    ...(f.processo && f.de ? { de: f.de } : {}),
  }
}

/**
 * Página calculada em memória. É A conta: o servidor a roda sobre o que lê do banco e o `mock` sobre o
 * estado local, então o demo mostra o que o servidor mostraria.
 */
export function paginarDocumentos(
  documentos: Documento[],
  processos: Processo[],
  f: Pick<FiltroListaDocumentos, 'aba' | 'categoria' | 'q' | 'processo' | 'pagina'>,
  opcoes: { podeApagar: boolean },
  locacoes: AlvoDocumento[] = [],
): PaginaDocumentos {
  const processoId = f.processo || null
  const abas = contarAbas(documentos, processos, processoId, locacoes)
  if (!opcoes.podeApagar) abas.lixeira = 0
  const alvos = [...processos, ...locacoes]
  const imovelDe = new Map(alvos.map((p) => [p.id, p.imovel]))
  if (f.aba === 'sem-pdf') {
    const pag = paginar(contratosSemPdf(processos, { busca: f.q, processoId }), f.pagina)
    return { ...pag, itens: [], contratos: pag.itens.map((p) => ({ id: p.id, imovel: p.imovel, status: p.status })), abas, imoveis: {}, truncado: false }
  }
  const pag = paginar(filtrarDocumentos(documentos, alvos, f.aba, { categoria: f.categoria, busca: f.q, processoId }), f.pagina)
  const ids = [...new Set(pag.itens.map((d) => d.processoId))].filter((i) => imovelDe.has(i))
  return { ...pag, contratos: [], abas, imoveis: Object.fromEntries(ids.map((i) => [i, imovelDe.get(i)!])), truncado: false }
}
