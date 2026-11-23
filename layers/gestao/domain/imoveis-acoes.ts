// `.ts` explícito: o mock carrega o domínio em Node puro.
import { rotuloImovel, semAcento, situacaoImovel, type ImovelGestao } from './imoveis.ts'
import { PROPERTY_TYPES, temQuartos } from '~~/shared/models/property-type'
import type { PropertyPurpose, PropertyStatus } from '~~/shared/models/property'
import type { PropertyType } from '~~/shared/models/property-type'
import type { Locacao, MatrizPermissoes, Sessao } from './types'

/** Campos que a tela edita. Texto vazio vira `null` em `validarImovel`; `type` e `purpose` vazios são «não escolhido». */
export interface NovoImovel {
  title: string
  type: PropertyType | ''
  purpose: PropertyPurpose | ''
  price: number | null
  status: PropertyStatus
  featured: boolean
  description: string
  features: string[]
  addressZip: string
  addressStreet: string
  addressNumber: string
  neighborhood: string
  city: string
  state: string
  /** Referência interna em texto livre (condomínio, bloco, ponto de referência). */
  location: string
  bedrooms: number | null
  suites: number | null
  bathrooms: number | null
  parking: number | null
  area: number | null
  highStandard: boolean
  ownerName: string
  ownerPhone: string
  brokerId: string
}

/** Campos já validados e normalizados: é o que vira imóvel. */
export type ImovelCampos = Omit<ImovelGestao, 'id' | 'images' | 'createdAt' | 'updatedAt'>

export type ResultadoImovel = { ok: true; imovel: ImovelGestao } | { ok: false; erro: string }
export type ResultadoValidacao = { ok: true; dados: ImovelCampos } | { ok: false; erro: string }

const NAO_ENCONTRADO = 'Imóvel não encontrado.'
const soDigitos = (s: string) => s.replace(/\D/g, '')
const texto = (s: string) => s.trim()
const ouNulo = (s: string) => texto(s) || null

export function formImovelVazio(brokerId = ''): NovoImovel {
  return {
    title: '', type: '', purpose: '', price: null, status: 'active', featured: false, description: '', features: [],
    addressZip: '', addressStreet: '', addressNumber: '', neighborhood: '', city: '', state: '', location: '',
    bedrooms: null, suites: null, bathrooms: null, parking: null, area: null, highStandard: false,
    ownerName: '', ownerPhone: '', brokerId,
  }
}

export function imovelParaForm(i: ImovelGestao): NovoImovel {
  return {
    title: i.title, type: i.type, purpose: i.purpose, price: i.price, status: i.status, featured: i.featured,
    description: i.description ?? '', features: [...i.features],
    addressZip: i.addressZip ?? '', addressStreet: i.addressStreet ?? '', addressNumber: i.addressNumber ?? '',
    neighborhood: i.neighborhood ?? '', city: i.city ?? '', state: i.state ?? '', location: i.location ?? '',
    bedrooms: i.bedrooms, suites: i.suites, bathrooms: i.bathrooms, parking: i.parking, area: i.area, highStandard: i.highStandard,
    ownerName: i.ownerName, ownerPhone: i.ownerPhone ?? '', brokerId: i.brokerId,
  }
}

const inteiro0a50 = (n: number | null) => (n === null ? 0 : Number.isInteger(n) && n >= 0 && n <= 50 ? n : null)

export type CampoImovel =
  | 'title' | 'type' | 'purpose' | 'price' | 'neighborhood' | 'city' | 'state' | 'addressZip' | 'area'
  | 'bedrooms' | 'suites' | 'bathrooms' | 'parking' | 'ownerName' | 'ownerPhone' | 'brokerId'

/**
 * TODOS os erros do formulário, por campo, na ordem em que os campos aparecem (a ordem das chaves
 * é a ordem do foco). A tela mostra cada um junto ao campo e foca o primeiro; `validarImovel`
 * devolve só o primeiro, para quem não tem campo (servidor, mock). Uma única fonte das regras.
 */
export function errosImovel(d: NovoImovel): Partial<Record<CampoImovel, string>> {
  const e: Partial<Record<CampoImovel, string>> = {}
  if (!texto(d.title)) e.title = 'Informe o título do imóvel.'
  if (!d.type || !PROPERTY_TYPES.includes(d.type)) e.type = 'Escolha o tipo do imóvel.'
  if (d.purpose !== 'venda' && d.purpose !== 'aluguel') e.purpose = 'Escolha a finalidade (venda ou aluguel).'
  if (d.price === null || !Number.isFinite(d.price) || d.price <= 0 || d.price > 1_000_000_000) e.price = 'Informe um preço maior que zero.'
  if (!texto(d.neighborhood)) e.neighborhood = 'Informe o bairro.'
  if (!texto(d.city)) e.city = 'Informe a cidade.'
  if (!/^[A-Z]{2}$/.test(texto(d.state).toUpperCase())) e.state = 'Informe a UF com 2 letras.'
  const zip = soDigitos(d.addressZip)
  if (zip && zip.length !== 8) e.addressZip = 'O CEP precisa de 8 dígitos.'
  if (d.area === null || !Number.isFinite(d.area) || d.area <= 0 || d.area > 1_000_000) e.area = 'Informe a área em m².'
  const contagens = [['bedrooms', 'Quartos', d.bedrooms], ['suites', 'Suítes', d.suites], ['bathrooms', 'Banheiros', d.bathrooms], ['parking', 'Vagas', d.parking]] as const
  for (const [campo, rotulo, valor] of contagens) {
    if (inteiro0a50(valor) === null) e[campo] = `${rotulo} precisa ser um número inteiro, de 0 a 50.`
  }
  if (!e.bedrooms && !e.suites && temQuartos(d.type || 'casa') && (d.suites ?? 0) > (d.bedrooms ?? 0)) e.suites = 'As suítes não podem passar do número de quartos.'
  if (!texto(d.ownerName)) e.ownerName = 'Informe o proprietário.'
  const phone = soDigitos(d.ownerPhone)
  if (phone && ![10, 11].includes(phone.length)) e.ownerPhone = 'O telefone do proprietário precisa de DDD e 8 ou 9 dígitos.'
  if (!texto(d.brokerId)) e.brokerId = 'Escolha o corretor vendedor.'
  return e
}

/** Primeiro erro vira frase pronta para a tela. A ordem das regras é a ordem dos campos no formulário. */
export function validarImovel(d: NovoImovel): ResultadoValidacao {
  const primeiro = Object.values(errosImovel(d))[0]
  if (primeiro) return { ok: false, erro: primeiro }
  const title = texto(d.title)
  const neighborhood = texto(d.neighborhood)
  const city = texto(d.city)
  const state = texto(d.state).toUpperCase()
  const zip = soDigitos(d.addressZip)
  const comQuartos = temQuartos(d.type as PropertyType)
  const validas = {
    Quartos: comQuartos ? (d.bedrooms ?? 0) : 0,
    Suítes: comQuartos ? (d.suites ?? 0) : 0,
    Banheiros: comQuartos ? (d.bathrooms ?? 0) : 0,
    Vagas: comQuartos ? (d.parking ?? 0) : 0,
  }
  const ownerName = texto(d.ownerName)
  const phone = soDigitos(d.ownerPhone)
  return {
    ok: true,
    dados: {
      title, type: d.type as PropertyType, purpose: d.purpose as PropertyPurpose, price: d.price as number, status: d.status, featured: d.featured,
      description: ouNulo(d.description), features: d.features.map(texto).filter(Boolean),
      addressZip: zip || null, addressStreet: ouNulo(d.addressStreet), addressNumber: ouNulo(d.addressNumber),
      neighborhood, city, state, location: ouNulo(d.location),
      bedrooms: validas.Quartos, suites: validas.Suítes, bathrooms: validas.Banheiros, parking: validas.Vagas,
      area: d.area as number, highStandard: d.highStandard,
      ownerName, ownerPhone: phone ? texto(d.ownerPhone) : null, brokerId: texto(d.brokerId),
    },
  }
}

/** O rótulo vira o texto do contrato: dois imóveis com o mesmo rótulo se confundem nas listas. */
function duplicado(imoveis: ImovelGestao[], dados: ImovelCampos, ignorarId: string | null): boolean {
  const alvo = semAcento(rotuloImovel(dados))
  return imoveis.some((i) => i.id !== ignorarId && semAcento(rotuloImovel(i)) === alvo)
}

function proximoIdImovel(imoveis: ImovelGestao[]): string {
  const maior = imoveis.reduce((m, i) => Math.max(m, Number(i.id.replace(/\D/g, '')) || 0), 100)
  return `im-${maior + 1}`
}

export function criarImovel(imoveis: ImovelGestao[], dados: NovoImovel, agora: string): ResultadoImovel {
  const v = validarImovel(dados)
  if (!v.ok) return v
  if (duplicado(imoveis, v.dados, null)) return { ok: false, erro: 'Já existe um imóvel com este título e endereço.' }
  return { ok: true, imovel: { ...v.dados, id: proximoIdImovel(imoveis), images: [], createdAt: agora, updatedAt: agora } }
}

export function atualizarImovel(imoveis: ImovelGestao[], id: string, dados: NovoImovel, agora: string): ResultadoImovel {
  const atual = imoveis.find((i) => i.id === id)
  if (!atual) return { ok: false, erro: NAO_ENCONTRADO }
  const v = validarImovel(dados)
  if (!v.ok) return v
  if (duplicado(imoveis, v.dados, id)) return { ok: false, erro: 'Já existe um imóvel com este título e endereço.' }
  return { ok: true, imovel: { ...atual, ...v.dados, updatedAt: agora } }
}

function alterar(imoveis: ImovelGestao[], id: string, mudanca: Partial<ImovelGestao>, agora: string): ResultadoImovel {
  const atual = imoveis.find((i) => i.id === id)
  return atual ? { ok: true, imovel: { ...atual, ...mudanca, updatedAt: agora } } : { ok: false, erro: NAO_ENCONTRADO }
}

export const mudarStatusImovel = (imoveis: ImovelGestao[], id: string, status: PropertyStatus, agora: string) => alterar(imoveis, id, { status }, agora)
export const definirDestaque = (imoveis: ImovelGestao[], id: string, featured: boolean, agora: string) => alterar(imoveis, id, { featured }, agora)

export function excluirImovel(imoveis: ImovelGestao[], id: string): { ok: true; imoveis: ImovelGestao[] } | { ok: false; erro: string } {
  if (!imoveis.some((i) => i.id === id)) return { ok: false, erro: NAO_ENCONTRADO }
  return { ok: true, imoveis: imoveis.filter((i) => i.id !== id) }
}

export interface PermissoesImovel {
  ver: boolean
  criar: boolean
  editar: boolean
  excluir: boolean
  trocarCorretor: boolean
}

/**
 * Todo perfil com acesso ao painel VÊ todos os imóveis do tenant (o corretor precisa achar qualquer um para abrir
 * contrato). Alterar é outra coisa: corretor com `verTodos = proprio` só edita os que captou (é o vendedor).
 * Excluir é do dono e do corretor vendedor (jurídico e recepção tiram do site mudando o status para rascunho).
 * O servidor repete esta regra: a tela só a espelha. Os PROCESSOS seguem outra regra, a de `processosVisiveis`.
 */
export function permissoesImovel(matriz: MatrizPermissoes, sessao: Sessao, imovel: ImovelGestao | null): PermissoesImovel {
  const todos = matriz.verTodos?.[sessao.perfil] === 'sim'
  const criar = matriz.criar?.[sessao.perfil] === 'sim'
  if (!imovel) return { ver: true, criar, editar: false, excluir: false, trocarCorretor: todos }
  const proprio = sessao.corretorId !== null && imovel.brokerId === sessao.corretorId
  const meu = todos || proprio
  return { ver: true, criar, editar: meu, excluir: meu && (sessao.perfil === 'dono' || proprio), trocarCorretor: todos }
}

export const imoveisVisiveis = (matriz: MatrizPermissoes, sessao: Sessao, imoveis: ImovelGestao[]): ImovelGestao[] =>
  imoveis.filter((i) => permissoesImovel(matriz, sessao, i).ver)

export function podeExcluirImovel(imovel: ImovelGestao, sessao: Sessao, matriz: MatrizPermissoes, locacoes: Locacao[]): { ok: true } | { ok: false; erro: string } {
  if (!permissoesImovel(matriz, sessao, imovel).excluir) return { ok: false, erro: 'Você não pode excluir este imóvel.' }
  if (situacaoImovel(imovel.id, locacoes) === 'em-locacao') {
    return { ok: false, erro: 'Este imóvel tem locação em andamento. Encerre ou arquive a locação antes de excluir.' }
  }
  return { ok: true }
}
