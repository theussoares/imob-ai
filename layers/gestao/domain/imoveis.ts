// `.ts` explícito: o seed da locação é carregado em Node puro pelo mock.
import { IMOVEIS_EXEMPLO } from './locacao-seed.ts'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property-type'
import type { Property, PropertyImage, PropertyPurpose, PropertyStatus } from '~~/shared/models/property'
import type { PropertyType } from '~~/shared/models/property-type'
import type { Locacao } from './types'

/**
 * Cadastro de imóveis da gestão — espelho do catálogo (`Property`). Em mock hoje; no backend a mesma
 * forma vai para `/api/admin/properties`. Os tipos derivam de `Property` para o espelho não divergir:
 * campo novo no catálogo entra aqui por `Pick`, e não por cópia.
 *
 * Não há captador (a regra ainda não existe). `brokerId` é o corretor vendedor: quem cadastra.
 */

export type FotoImovel = Pick<PropertyImage, 'id' | 'url' | 'urlSm' | 'alt' | 'position' | 'isCover'>

type CamposDoCatalogo = Pick<
  Property,
  | 'title' | 'type' | 'purpose' | 'price' | 'neighborhood' | 'city' | 'state'
  | 'addressZip' | 'addressStreet' | 'addressNumber' | 'location'
  | 'bedrooms' | 'suites' | 'bathrooms' | 'parking' | 'area' | 'highStandard'
  | 'description' | 'features' | 'status' | 'featured' | 'createdAt' | 'updatedAt'
>

export interface ImovelGestao extends CamposDoCatalogo {
  id: string
  /**
   * Código do catálogo (`properties.code`). Gerado pelo servidor; o formulário não o pede, e o mock
   * (seed `im-101…`) não tem. Opcional por isso.
   */
  code?: string
  /** Corretor vendedor (quem cadastrou). No site só aparece se o corretor estiver configurado para isso. */
  brokerId: string
  /** Dado interno: nunca vai para o site. */
  ownerName: string
  ownerPhone: string | null
  images: FotoImovel[]
}

export const ROTULO_FINALIDADE: Record<PropertyPurpose, string> = { venda: 'Venda', aluguel: 'Aluguel' }

export const STATUS_IMOVEL: PropertyStatus[] = ['active', 'draft', 'sold', 'rented']
export const ROTULO_STATUS_IMOVEL: Record<PropertyStatus, string> = {
  active: 'No site',
  draft: 'Rascunho',
  sold: 'Vendido',
  rented: 'Alugado',
}

export const rotuloTipoImovel = (t: PropertyType) => PROPERTY_TYPE_LABELS[t]

/** Situação pelo contrato (derivada das locações), separada do status do anúncio. */
export type SituacaoImovel = 'disponivel' | 'em-locacao'
export const ROTULO_SITUACAO_IMOVEL: Record<SituacaoImovel, string> = {
  disponivel: 'Disponível',
  'em-locacao': 'Em locação',
}

/** Texto que vai para o contrato (o mesmo formato que as locações do seed já usam). */
export const rotuloImovel = (i: Pick<ImovelGestao, 'title' | 'location'>) => (i.location ? `${i.title} · ${i.location}` : i.title)

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Complemento = Pick<ImovelGestao, 'type' | 'purpose' | 'price' | 'neighborhood' | 'bedrooms' | 'suites' | 'bathrooms' | 'parking' | 'area' | 'ownerName' | 'brokerId'>

/**
 * O seed nasce de `IMOVEIS_EXEMPLO` para os ids (`im-101..`) e os rótulos das locações de exemplo
 * continuarem batendo com o cadastro; o rótulo é quebrado no primeiro « · ». Os que eram «Venda e
 * locação» viram aluguel: as telas de locação listam só aluguel.
 */
const COMPLEMENTO: Record<string, Complemento> = {
  'im-101': { type: 'apartamento', purpose: 'aluguel', price: 2800, neighborhood: 'Centro', bedrooms: 2, suites: 1, bathrooms: 2, parking: 1, area: 68, ownerName: 'Helena Duarte', brokerId: 'c1' },
  'im-102': { type: 'casa', purpose: 'venda', price: 520000, neighborhood: 'Jardim América', bedrooms: 3, suites: 1, bathrooms: 2, parking: 2, area: 160, ownerName: 'Otávio Ramos', brokerId: 'c2' },
  'im-103': { type: 'sala', purpose: 'aluguel', price: 3500, neighborhood: 'Centro', bedrooms: 0, suites: 0, bathrooms: 1, parking: 1, area: 45, ownerName: 'Grupo Centro Ltda', brokerId: 'c3' },
  'im-104': { type: 'kitnet', purpose: 'aluguel', price: 1200, neighborhood: 'Vila Nova', bedrooms: 1, suites: 0, bathrooms: 1, parking: 0, area: 28, ownerName: 'Marta Kobayashi', brokerId: 'c1' },
  'im-105': { type: 'barracao', purpose: 'aluguel', price: 9800, neighborhood: 'Distrito Industrial', bedrooms: 0, suites: 0, bathrooms: 2, parking: 4, area: 600, ownerName: 'Indústrias Nova Era', brokerId: 'c2' },
}

const DATA_SEED = '2026-11-01T12:00:00.000Z'

export function imoveisSeed(): ImovelGestao[] {
  return IMOVEIS_EXEMPLO.map((i) => {
    const [title, ...resto] = i.rotulo.split(' · ')
    return {
      id: i.id,
      title: title!,
      location: resto.join(' · ') || null,
      ...COMPLEMENTO[i.id]!,
      city: 'Três Lagoas',
      state: 'MS',
      addressZip: null,
      addressStreet: null,
      addressNumber: null,
      highStandard: false,
      description: null,
      features: [],
      status: 'active',
      featured: false,
      ownerPhone: null,
      images: [],
      createdAt: DATA_SEED,
      updatedAt: DATA_SEED,
    }
  })
}

/** Em locação = há locação do imóvel que não foi encerrada nem arquivada. */
export function situacaoImovel(imovelId: string, locacoes: Locacao[]): SituacaoImovel {
  return locacoes.some((l) => l.imovelId === imovelId && l.status !== 'Encerrada' && !l.arquivado) ? 'em-locacao' : 'disponivel'
}

export interface FiltroImoveis {
  busca: string
  situacao: SituacaoImovel | ''
  purpose: PropertyPurpose | ''
  status: PropertyStatus | ''
}
export const FILTRO_IMOVEIS_VAZIO: FiltroImoveis = { busca: '', situacao: '', purpose: '', status: '' }

export function filtrarImoveis(imoveis: ImovelGestao[], locacoes: Locacao[], f: FiltroImoveis): ImovelGestao[] {
  const q = semAcento(f.busca.trim())
  return imoveis.filter((i) => {
    if (f.situacao && situacaoImovel(i.id, locacoes) !== f.situacao) return false
    if (f.purpose && i.purpose !== f.purpose) return false
    if (f.status && i.status !== f.status) return false
    return !q || semAcento(`${i.title} ${i.location ?? ''} ${i.neighborhood ?? ''} ${i.ownerName} ${i.id}`).includes(q)
  })
}
