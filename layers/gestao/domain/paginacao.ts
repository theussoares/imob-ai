/**
 * Paginação das listas de contratos (vendas e locações), a mesma no mock, no servidor e na tela.
 *
 * O tamanho da página é fixo (24 = 2, 3 e 4 colunas de cards fecham sem sobra): deixar a URL
 * escolher `porPagina` permitiria pedir a lista inteira de uma vez, que é o que a paginação
 * existe para evitar.
 */
export const POR_PAGINA = 24

export interface Pagina<T> {
  itens: T[]
  /** Total que casa com o filtro, em TODAS as páginas (não só nesta). */
  total: number
  pagina: number
  porPagina: number
  /** Sempre ≥ 1: lista vazia tem uma página vazia, e a tela não precisa de caso especial. */
  paginas: number
}

/** Número de página vindo da URL: inteiro ≥ 1; lixo (`abc`, `0`, `-3`, `1.5`) vira 1. */
export function lerPagina(valor: unknown): number {
  const v = Array.isArray(valor) ? valor[0] : valor
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export const totalDePaginas = (total: number, porPagina = POR_PAGINA): number => Math.max(1, Math.ceil(total / porPagina))

/** Fatia a lista. Página além da última devolve `itens` vazio (a tela redireciona para a última). */
export function paginar<T>(lista: T[], pagina: number, porPagina = POR_PAGINA): Pagina<T> {
  const p = Math.max(1, pagina)
  return {
    itens: lista.slice((p - 1) * porPagina, p * porPagina),
    total: lista.length,
    pagina: p,
    porPagina,
    paginas: totalDePaginas(lista.length, porPagina),
  }
}

/**
 * Contagem por status, para as abas da lista. Vem do servidor e respeita a busca `q` e o escopo do perfil,
 * mas NÃO o status escolhido: a aba ativa não pode zerar as outras, senão trocar de aba esconderia justo
 * as abas para onde o usuário queria ir. Calculada sobre todas as páginas, não só a atual.
 */
export type Contagens = Record<string, number>

export type PaginaComContagens<T> = Pagina<T> & { contagens: Contagens }

/** Conta por status, com zero explícito para os que não aparecem (o contrato é «uma chave por status válido»). */
export function contarPorStatus(lista: readonly { status: string }[], statusValidos: readonly string[]): Contagens {
  const c: Contagens = Object.fromEntries(statusValidos.map((s) => [s, 0]))
  for (const { status } of lista) if (status in c) c[status]!++
  return c
}

/**
 * Abas da lista: «Todos» (status '') primeiro e depois só os status com contagem > 0, na ordem do fluxo.
 * São 13 status de venda; mostrar todas as abas deixaria a maioria em «0» e empurraria as úteis para fora
 * da tela. O status ATIVO fica mesmo com contagem 0 (link antigo, ou a última do status foi movida): sumir
 * com a aba em que o usuário está o deixaria sem saber qual filtro vale.
 */
export function abasDeStatus(contagens: Contagens | undefined, ordem: readonly string[], ativo = ''): { status: string; total: number }[] {
  const c = contagens ?? {}
  const total = ordem.reduce((soma, s) => soma + (c[s] ?? 0), 0)
  return [
    { status: '', total },
    ...ordem.filter((s) => (c[s] ?? 0) > 0 || s === ativo).map((s) => ({ status: s, total: c[s] ?? 0 })),
  ]
}

/** Filtro de uma lista de contratos: o que vive na URL (`?pagina=2&q=silva&status=Concluído`). */
export interface FiltroLista {
  pagina: number
  q: string
  /** '' = todos */
  status: string
}

const primeiro = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')

/**
 * URL → filtro. A URL é entrada do usuário (colada, antiga, editada à mão): status fora da lista vira
 * «todos» em vez de uma lista vazia sem explicação, e `q` é cortada no mesmo limite do servidor.
 */
export function filtroDaUrl(query: Record<string, unknown>, statusValidos: readonly string[]): FiltroLista {
  const status = primeiro(query.status)
  return {
    pagina: lerPagina(query.pagina),
    q: primeiro(query.q).slice(0, 100),
    status: statusValidos.includes(status) ? status : '',
  }
}

/** Filtro → query da URL, sem o que é padrão: a lista sem filtro fica em `/gestao/vendas`, sem `?pagina=1`. */
export function queryDaLista(f: FiltroLista): Record<string, string> {
  const q = f.q.trim()
  return {
    ...(f.pagina > 1 ? { pagina: String(f.pagina) } : {}),
    ...(q ? { q } : {}),
    ...(f.status ? { status: f.status } : {}),
  }
}

/** Filtro da tela «Arquivados»: vendas e locações são duas listas, uma por vez (`?tipo=locacao&pagina=2&q=…`). */
export interface FiltroArquivados {
  pagina: number
  q: string
  tipo: 'venda' | 'locacao'
}

export function filtroArquivadosDaUrl(query: Record<string, unknown>): FiltroArquivados {
  return { pagina: lerPagina(query.pagina), q: primeiro(query.q).slice(0, 100), tipo: primeiro(query.tipo) === 'locacao' ? 'locacao' : 'venda' }
}

export function queryDosArquivados(f: FiltroArquivados): Record<string, string> {
  const q = f.q.trim()
  return { ...(f.tipo === 'locacao' ? { tipo: 'locacao' } : {}), ...(q ? { q } : {}), ...(f.pagina > 1 ? { pagina: String(f.pagina) } : {}) }
}
