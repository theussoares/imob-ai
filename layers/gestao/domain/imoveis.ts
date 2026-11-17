// `.ts` explícito: o seed da locação é carregado em Node puro pelo mock.
import { IMOVEIS_EXEMPLO } from './locacao-seed.ts'
import type { Locacao } from './types'

/**
 * Cadastro de imóveis da gestão — MOCK. O cadastro real (`properties`) entra quando
 * a tela for ligada à API; por isso o modelo é próprio daqui e não reaproveita o do
 * catálogo público (que tem colunas internas que a gestão não deve espalhar).
 */

export const TIPOS_IMOVEL = ['Apartamento', 'Casa', 'Sala comercial', 'Kitnet', 'Barracão', 'Terreno'] as const
export type TipoImovel = (typeof TIPOS_IMOVEL)[number]

export const FINALIDADES_IMOVEL = ['Venda', 'Locação', 'Venda e locação'] as const
export type FinalidadeImovel = (typeof FINALIDADES_IMOVEL)[number]

export interface ImovelGestao {
  id: string
  titulo: string
  endereco: string
  tipo: TipoImovel
  finalidade: FinalidadeImovel
  proprietario: string
  captadorId: string
}

export type SituacaoImovel = 'disponivel' | 'em-locacao'
export const ROTULO_SITUACAO_IMOVEL: Record<SituacaoImovel, string> = {
  disponivel: 'Disponível',
  'em-locacao': 'Em locação',
}

/** Texto que vai para o contrato (o mesmo formato que as locações do seed já usam). */
export const rotuloImovel = (i: Pick<ImovelGestao, 'titulo' | 'endereco'>) => (i.endereco ? `${i.titulo} · ${i.endereco}` : i.titulo)

/**
 * O seed nasce de `IMOVEIS_EXEMPLO` para os ids (`im-101..`) e os rótulos das locações
 * de exemplo continuarem batendo com o cadastro; o rótulo é quebrado no primeiro « · ».
 */
const COMPLEMENTO: Record<string, Pick<ImovelGestao, 'tipo' | 'finalidade' | 'proprietario' | 'captadorId'>> = {
  'im-101': { tipo: 'Apartamento', finalidade: 'Venda e locação', proprietario: 'Helena Duarte', captadorId: 'c1' },
  'im-102': { tipo: 'Casa', finalidade: 'Venda', proprietario: 'Otávio Ramos', captadorId: 'c2' },
  'im-103': { tipo: 'Sala comercial', finalidade: 'Locação', proprietario: 'Grupo Centro Ltda', captadorId: 'c3' },
  'im-104': { tipo: 'Kitnet', finalidade: 'Locação', proprietario: 'Marta Kobayashi', captadorId: 'c1' },
  'im-105': { tipo: 'Barracão', finalidade: 'Venda e locação', proprietario: 'Indústrias Nova Era', captadorId: 'c2' },
}

export function imoveisSeed(): ImovelGestao[] {
  return IMOVEIS_EXEMPLO.map((i) => {
    const [titulo, ...resto] = i.rotulo.split(' · ')
    return { id: i.id, titulo: titulo!, endereco: resto.join(' · '), ...COMPLEMENTO[i.id]! }
  })
}

/** Em locação = há locação do imóvel que não foi encerrada nem arquivada. */
export function situacaoImovel(imovelId: string, locacoes: Locacao[]): SituacaoImovel {
  return locacoes.some((l) => l.imovelId === imovelId && l.status !== 'Encerrada' && !l.arquivado) ? 'em-locacao' : 'disponivel'
}

export interface FiltroImoveis {
  busca: string
  situacao: SituacaoImovel | ''
  finalidade: FinalidadeImovel | ''
}
export const FILTRO_IMOVEIS_VAZIO: FiltroImoveis = { busca: '', situacao: '', finalidade: '' }

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarImoveis(imoveis: ImovelGestao[], locacoes: Locacao[], f: FiltroImoveis): ImovelGestao[] {
  const q = sem(f.busca.trim())
  return imoveis.filter((i) => {
    if (f.situacao && situacaoImovel(i.id, locacoes) !== f.situacao) return false
    if (f.finalidade && i.finalidade !== f.finalidade) return false
    return !q || sem(`${i.titulo} ${i.endereco} ${i.proprietario} ${i.id}`).includes(q)
  })
}

export interface NovoImovel {
  titulo: string
  endereco: string
  tipo: TipoImovel | ''
  finalidade: FinalidadeImovel | ''
  proprietario: string
  captadorId: string
}

export type ResultadoImovel = { ok: true; imovel: ImovelGestao } | { ok: false; erro: string }

export function proximoIdImovel(imoveis: ImovelGestao[]): string {
  const maior = imoveis.reduce((m, i) => Math.max(m, Number(i.id.replace(/\D/g, '')) || 0), 100)
  return `im-${maior + 1}`
}

export function cadastrarImovel(imoveis: ImovelGestao[], dados: NovoImovel): ResultadoImovel {
  const titulo = dados.titulo.trim()
  const proprietario = dados.proprietario.trim()
  if (!titulo) return { ok: false, erro: 'Informe o título do imóvel.' }
  if (!dados.tipo) return { ok: false, erro: 'Escolha o tipo do imóvel.' }
  if (!dados.finalidade) return { ok: false, erro: 'Escolha a finalidade (venda, locação ou ambas).' }
  if (!proprietario) return { ok: false, erro: 'Informe o proprietário.' }
  if (!dados.captadorId) return { ok: false, erro: 'Escolha o corretor captador.' }
  const endereco = dados.endereco.trim()
  // O rótulo vira o texto do contrato: dois imóveis com o mesmo rótulo se confundem nas listas.
  const rotulo = sem(rotuloImovel({ titulo, endereco }))
  if (imoveis.some((i) => sem(rotuloImovel(i)) === rotulo)) return { ok: false, erro: 'Já existe um imóvel com este título e endereço.' }
  return {
    ok: true,
    imovel: { id: proximoIdImovel(imoveis), titulo, endereco, tipo: dados.tipo, finalidade: dados.finalidade, proprietario, captadorId: dados.captadorId },
  }
}
