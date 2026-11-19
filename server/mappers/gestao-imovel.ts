import type { Property, PropertyInput } from '~~/shared/models/property'
import type { ImovelGestao } from '~~/layers/gestao/domain/imoveis'
import type { NovoImovel } from '~~/layers/gestao/domain/imoveis-acoes'

/**
 * `Property` (modelo admin, camelCase) → `ImovelGestao`. É o ÚNICO caminho do
 * banco para o painel de gestão: o shape é montado campo a campo, não por spread,
 * para uma coluna nova de `properties` não chegar à tela sem decisão explícita.
 * Ficam de fora `updatedBy` (id de funcionário), `broker` (traz telefone e
 * e-mail do corretor), `tenantId` e `capturedBy`.
 *
 * `brokerId` e `ownerName` são obrigatórios no `ImovelGestao`, mas nulos em
 * imóvel antigo do catálogo (cadastrado no `/admin` sem corretor/proprietário):
 * viram `''`, que a tela lê como «sem corretor» e `validarImovel` recusa na
 * próxima edição, forçando a escolha.
 */
export function toImovelGestao(p: Property): ImovelGestao {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    type: p.type,
    purpose: p.purpose,
    price: p.price,
    neighborhood: p.neighborhood,
    city: p.city,
    state: p.state,
    addressZip: p.addressZip ?? null,
    addressStreet: p.addressStreet ?? null,
    addressNumber: p.addressNumber ?? null,
    location: p.location ?? null,
    bedrooms: p.bedrooms,
    suites: p.suites,
    bathrooms: p.bathrooms,
    parking: p.parking,
    area: p.area,
    highStandard: p.highStandard,
    description: p.description,
    features: p.features,
    status: p.status,
    featured: p.featured,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    brokerId: p.brokerId ?? '',
    ownerName: p.ownerName ?? '',
    ownerPhone: p.ownerPhone ?? null,
    images: p.images.map((i) => ({ id: i.id, url: i.url, urlSm: i.urlSm, alt: i.alt, position: i.position, isCover: i.isCover })),
  }
}

const eTexto = (v: unknown): v is string => typeof v === 'string'
const textoOu = (v: unknown, padrao = ''): string => (eTexto(v) ? v : padrao)
const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Corpo cru da requisição → `NovoImovel`. `validarImovel` (domínio) assume os tipos
 * do TypeScript — chama `.trim()` em string —, mas o que chega pela rede é `unknown`:
 * um `title: 123` seria TypeError, ou seja, 500 em vez de 422. Aqui cada campo é
 * coagido para a forma certa ou vira o valor «vazio», e a validação de verdade
 * (obrigatório, faixa, UF) continua toda no domínio.
 *
 * Campo que NÃO é lido: `tenantId`, `id`, `code`, `images`, `updatedBy`. Quem manda
 * é o servidor; o corpo nunca decide o tenant (CLAUDE.md, invariante 1).
 */
export function lerCorpoImovel(raw: unknown): { ok: true; dados: NovoImovel; expectedUpdatedAt: string | null } | { ok: false; erro: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, erro: 'Dados inválidos.' }
  const b = raw as Record<string, unknown>
  if (b.features !== undefined && (!Array.isArray(b.features) || !b.features.every(eTexto))) {
    return { ok: false, erro: 'As características precisam ser uma lista de textos.' }
  }
  const status = b.status === undefined ? 'active' : b.status
  if (status !== 'active' && status !== 'draft' && status !== 'sold' && status !== 'rented') return { ok: false, erro: 'Status inválido.' }
  const type = textoOu(b.type)
  const purpose = textoOu(b.purpose)
  return {
    ok: true,
    expectedUpdatedAt: eTexto(b.expectedUpdatedAt) && b.expectedUpdatedAt ? b.expectedUpdatedAt : null,
    dados: {
      title: textoOu(b.title),
      type: type as NovoImovel['type'],
      purpose: purpose as NovoImovel['purpose'],
      price: numeroOuNulo(b.price),
      status,
      featured: b.featured === true,
      description: textoOu(b.description),
      features: (b.features as string[] | undefined) ?? [],
      addressZip: textoOu(b.addressZip),
      addressStreet: textoOu(b.addressStreet),
      addressNumber: textoOu(b.addressNumber),
      neighborhood: textoOu(b.neighborhood),
      city: textoOu(b.city),
      state: textoOu(b.state),
      location: textoOu(b.location),
      bedrooms: numeroOuNulo(b.bedrooms),
      suites: numeroOuNulo(b.suites),
      bathrooms: numeroOuNulo(b.bathrooms),
      parking: numeroOuNulo(b.parking),
      area: numeroOuNulo(b.area),
      highStandard: b.highStandard === true,
      ownerName: textoOu(b.ownerName),
      ownerPhone: textoOu(b.ownerPhone),
      brokerId: textoOu(b.brokerId),
    },
  }
}

/** Campos já validados (`validarImovel`) → payload do `property.repository`. O código é do servidor. */
export function toPropertyInput(dados: Omit<ImovelGestao, 'id' | 'images' | 'createdAt' | 'updatedAt' | 'code'>, code: string): PropertyInput {
  return {
    code,
    title: dados.title,
    type: dados.type,
    purpose: dados.purpose,
    price: dados.price,
    neighborhood: dados.neighborhood,
    city: dados.city,
    state: dados.state,
    bedrooms: dados.bedrooms,
    suites: dados.suites,
    bathrooms: dados.bathrooms,
    parking: dados.parking,
    area: dados.area,
    highStandard: dados.highStandard,
    description: dados.description,
    features: dados.features,
    status: dados.status,
    featured: dados.featured,
    location: dados.location,
    addressZip: dados.addressZip,
    addressStreet: dados.addressStreet,
    addressNumber: dados.addressNumber,
    brokerId: dados.brokerId,
    ownerName: dados.ownerName,
    ownerPhone: dados.ownerPhone,
  }
}
