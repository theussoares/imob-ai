import { ROTULO_SITUACAO_IMOVEL, STATUS_IMOVEL, filtrarImoveisPorSituacao, type FiltroImoveis, type ImovelGestao, type SituacaoImovel } from './imoveis.ts'
import { lerPagina, paginar, type Pagina } from './paginacao.ts'
import type { PropertyPurpose, PropertyStatus } from '~~/shared/models/property'

/**
 * Lista paginada de imóveis (`/gestao/imoveis`), a mesma no mock, no servidor e na tela. Página, busca e
 * os três filtros vivem na URL; o tamanho da página é fixo (`POR_PAGINA`), como nas listas de contratos.
 */
export interface FiltroListaImoveis {
  pagina: number
  q: string
  /** Situação do anúncio no site (`properties.status`). '' = todos. */
  status: PropertyStatus | ''
  purpose: PropertyPurpose | ''
  /** Derivada dos contratos (`situacaoImovel`). '' = todas. */
  situacao: SituacaoImovel | ''
}

export const FILTRO_LISTA_IMOVEIS_VAZIO: FiltroListaImoveis = { pagina: 1, q: '', status: '', purpose: '', situacao: '' }

/** O imóvel e a situação que o servidor calculou dos contratos DO TENANT (o corretor só carrega os contratos dele). */
export type ImovelDaLista = ImovelGestao & { situacao: SituacaoImovel }

export type PaginaImoveis = Pagina<ImovelDaLista> & {
  /** A busca/filtro por situação lê até o teto de imóveis do tenant; `true` = passou dele (a tela avisa). */
  truncado: boolean
}

export const FINALIDADES_IMOVEL: readonly PropertyPurpose[] = ['venda', 'aluguel']
export const SITUACOES_IMOVEL = Object.keys(ROTULO_SITUACAO_IMOVEL) as SituacaoImovel[]
const primeiro = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')
const dentro = <T extends string>(valor: string, validos: readonly T[]): T | '' => ((validos as readonly string[]).includes(valor) ? (valor as T) : '')

/** URL → filtro. A URL é entrada do usuário: valor fora da lista vira «todos», e `q` é cortada no limite do servidor. */
export function filtroImoveisDaUrl(query: Record<string, unknown>): FiltroListaImoveis {
  return {
    pagina: lerPagina(query.pagina),
    q: primeiro(query.q).slice(0, 100),
    status: dentro(primeiro(query.status), STATUS_IMOVEL),
    purpose: dentro(primeiro(query.purpose), FINALIDADES_IMOVEL),
    situacao: dentro(primeiro(query.situacao), SITUACOES_IMOVEL),
  }
}

/** Filtro → query, sem o que é padrão: a lista sem filtro fica em `/gestao/imoveis`. */
export function queryDaListaImoveis(f: FiltroListaImoveis): Record<string, string> {
  const q = f.q.trim()
  return {
    ...(f.pagina > 1 ? { pagina: String(f.pagina) } : {}),
    ...(q ? { q } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.purpose ? { purpose: f.purpose } : {}),
    ...(f.situacao ? { situacao: f.situacao } : {}),
  }
}

/** A lista precisa de TODOS os imóveis do tenant (e não só da página) quando o texto ou a situação decidem quem entra. */
export const filtroPedeVarredura = (f: Pick<FiltroListaImoveis, 'q' | 'situacao'>): boolean => !!f.q.trim() || !!f.situacao

const comoFiltro = (f: FiltroListaImoveis): FiltroImoveis => ({ busca: f.q, situacao: f.situacao, purpose: f.purpose, status: f.status })

/**
 * Filtra e fatia uma lista que já está inteira em memória (o mock, e o caminho de busca do servidor). A situação
 * vem de fora: o mock a calcula dos contratos carregados, o servidor das duas colunas que lê.
 */
export function paginaDeImoveis(imoveis: ImovelGestao[], situacaoDe: (id: string) => SituacaoImovel, f: FiltroListaImoveis): Pagina<ImovelDaLista> {
  const casadas = filtrarImoveisPorSituacao(imoveis, situacaoDe, comoFiltro(f))
  const pag = paginar(casadas, f.pagina)
  return { ...pag, itens: pag.itens.map((i) => ({ ...i, situacao: situacaoDe(i.id) })) }
}
