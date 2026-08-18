import type { PropertyPurpose, PropertyType } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

/** Os filtros do catálogo que dizem algo sobre o que a pessoa procura. */
export interface SearchCriteria {
  purpose: PropertyPurpose
  q: string
  type: PropertyType | ''
  bedrooms: number
  maxPrice: number
}

/**
 * R$ sem centavos, para texto puro.
 *
 * Duplica o `formatBRL` do app porque este arquivo também roda no servidor, que
 * não enxerga os composables. E troca o espaço não-quebrável que o
 * `toLocaleString` insere depois do "R$" por um espaço comum: o resultado vai
 * para o campo de mensagem do lead, que o corretor copia para o WhatsApp — e
 * caractere invisível em texto puro só causa surpresa.
 */
function reais(v: number): string {
  return v
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    .replace(/ /g, ' ')
}

/**
 * Descreve, em português, só os filtros que a pessoa realmente aplicou.
 *
 * O valor de capturar no catálogo vazio é não perguntar de novo o que ela já
 * informou. Listar filtro não usado inventaria critério que ela não pediu, e o
 * corretor sairia procurando errado.
 */
export function searchCriteriaParts(f: SearchCriteria): string[] {
  const partes: string[] = []
  if (f.type) partes.push(PROPERTY_TYPE_LABELS[f.type].toLowerCase())
  // O filtro é `bedrooms >= n`. Dizer "3 quartos" faria o corretor descartar o
  // de 4, que serviria.
  if (f.bedrooms) partes.push(`a partir de ${f.bedrooms} ${f.bedrooms === 1 ? 'quarto' : 'quartos'}`)
  if (f.maxPrice) partes.push(`até ${reais(f.maxPrice)}`)
  // Busca livre casa com bairro, cidade, título e código — por isso "buscando
  // por", e não "no bairro X": não dá para afirmar o que o termo significava.
  if (f.q.trim()) partes.push(`buscando por "${f.q.trim()}"`)
  return partes
}

/**
 * Mensagem do lead de quem procura imóvel, montada a partir dos filtros ativos.
 *
 * Abre pela intenção (comprar ou alugar) porque é o que muda o atendimento, e
 * continua útil mesmo sem filtro nenhum — quem clica no fim do catálogo pode não
 * ter filtrado nada, e o lead não pode chegar com a mensagem vazia.
 */
export function buildSearchLeadMessage(f: SearchCriteria, note = ''): string {
  const intencao = `Procura imóvel para ${f.purpose === 'aluguel' ? 'alugar' : 'comprar'}`
  const base = [intencao, ...searchCriteriaParts(f)].join(' · ')
  const obs = note.trim()
  return obs ? `${base} — ${obs}` : base
}
