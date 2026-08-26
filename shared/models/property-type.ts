/**
 * Registro dos tipos de imóvel — fonte única.
 *
 * Antes, cada tipo vivia espalhado por oito arquivos: a união de tipos, a lista,
 * os rótulos, o slug e o plural da categoria, o validador do servidor, o enum da
 * ferramenta de agente e o mapa do feed dos portais. Acrescentar um tipo exigia
 * acertar os oito, e esquecer o mapa do feed COMPILAVA — o imóvel só sumia do
 * ZAP, sem erro em lugar nenhum.
 *
 * Aqui cada tipo declara tudo sobre si e o resto deriva. Acrescentar um tipo é
 * uma linha, e o TypeScript recusa a linha incompleta.
 *
 * Campos:
 * - `label`/`plural`: o que a pessoa lê. Plural alimenta "Casas à venda".
 * - `slug`: entra na URL da categoria (/imoveis/casas-a-venda). Sem acento.
 * - `temQuartos`: se a ficha e o título anunciam quartos ou área.
 * - `schema`: tipo do schema.org no JSON-LD da página de detalhe.
 * - `vrsync`: valor da ontologia do Grupo OLX (ZAP/VivaReal). Precisa ser um
 *   valor DOCUMENTADO — string fora da lista deles faz o portal recusar o
 *   anúncio. Ver developers.grupozap.com/feeds/vrsync/elements/details.html
 *
 * A chave é o que fica gravado no banco. Só letras minúsculas sem acento: ela
 * também entra na URL do imóvel (/casa-3-quartos-centro/NC-0231).
 *
 * A taxonomia completa do portal tem quatro categorias (Residencial, Comercial,
 * Corporativo, Rural) e mais de trinta combinações. Só entram aqui os tipos que
 * alguém realmente cadastra: opção demais no formulário não deixa o cadastro
 * mais preciso, deixa mais inconsistente. Quando um cliente pedir outro, é uma
 * linha — e vale conferir na lista deles em qual categoria ele vive.
 */
export interface PropertyTypeInfo {
  label: string
  plural: string
  slug: string
  temQuartos: boolean
  schema: string
  vrsync: string
}

export const PROPERTY_TYPE_REGISTRY = {
  casa: {
    label: 'Casa',
    plural: 'Casas',
    slug: 'casas',
    temQuartos: true,
    schema: 'House',
    vrsync: 'Residential / Home',
  },
  apartamento: {
    label: 'Apartamento',
    plural: 'Apartamentos',
    slug: 'apartamentos',
    temQuartos: true,
    schema: 'Apartment',
    vrsync: 'Residential / Apartment',
  },
  sobrado: {
    label: 'Sobrado',
    plural: 'Sobrados',
    slug: 'sobrados',
    temQuartos: true,
    schema: 'House',
    // O VRSync tem valor próprio para sobrado. Até aqui mandávamos
    // 'Residential / Home' e todo sobrado chegava ao portal como casa genérica.
    vrsync: 'Residential / Sobrado',
  },
  kitnet: {
    label: 'Kitnet',
    plural: 'Kitnets',
    slug: 'kitnets',
    temQuartos: true,
    schema: 'Apartment',
    vrsync: 'Residential / Kitnet',
  },
  chacara: {
    label: 'Chácara',
    plural: 'Chácaras',
    slug: 'chacaras',
    temQuartos: true,
    schema: 'House',
    vrsync: 'Residential / Farm Ranch',
  },
  rancho: {
    label: 'Rancho',
    plural: 'Ranchos',
    slug: 'ranchos',
    temQuartos: true,
    schema: 'House',
    // Mesmo valor da chácara: a ontologia deles não separa os dois. Dois tipos
    // nossos caindo no mesmo valor do portal é esperado — casa e sobrado já
    // faziam isso antes de o sobrado ganhar o próprio.
    vrsync: 'Residential / Farm Ranch',
  },
  terreno: {
    label: 'Terreno',
    plural: 'Terrenos',
    slug: 'terrenos',
    temQuartos: false,
    schema: 'Place',
    vrsync: 'Residential / Land Lot',
  },
  barracao: {
    label: 'Barracão',
    plural: 'Barracões',
    slug: 'barracoes',
    temQuartos: false,
    schema: 'Place',
    // A ontologia do VRSync não tem "barracão" nem "galpão"; 'Industrial' é o
    // valor mais próximo do bloco Comercial. ESCOLHA A VALIDAR com o Canal Pro:
    // se estiver errada, o anúncio aparece na vitrine errada do portal.
    vrsync: 'Commercial / Industrial',
  },
  sala: {
    label: 'Sala',
    plural: 'Salas',
    slug: 'salas',
    temQuartos: false,
    schema: 'Place',
    vrsync: 'Commercial / Office',
  },
  salao: {
    label: 'Salão',
    plural: 'Salões',
    slug: 'saloes',
    temQuartos: false,
    schema: 'Place',
    vrsync: 'Commercial / Business',
  },
  predio: {
    label: 'Prédio',
    plural: 'Prédios',
    slug: 'predios',
    temQuartos: false,
    schema: 'Place',
    vrsync: 'Commercial / Edificio Comercial',
  },
} as const satisfies Record<string, PropertyTypeInfo>

/** A união sai do registro: não há como a lista e o tipo divergirem. */
export type PropertyType = keyof typeof PROPERTY_TYPE_REGISTRY

export const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_REGISTRY) as PropertyType[]

export const PROPERTY_TYPE_LABELS = Object.fromEntries(
  Object.entries(PROPERTY_TYPE_REGISTRY).map(([k, v]) => [k, v.label]),
) as Record<PropertyType, string>

/**
 * O tipo anuncia quartos, ou área?
 *
 * Substitui os `=== 'terreno'` que estavam espalhados. Eles nunca quiseram
 * saber qual era o tipo — queriam saber se havia quarto para mostrar. Com
 * terreno, barracão, sala, salão e prédio na mesma situação, perguntar pelo
 * nome de cada um não escalaria.
 */
export function temQuartos(type: PropertyType): boolean {
  return PROPERTY_TYPE_REGISTRY[type].temQuartos
}
