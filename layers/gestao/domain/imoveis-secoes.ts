import type { CampoImovel, NovoImovel } from './imoveis-acoes.ts'

/** Blocos do formulário de imóvel, na ordem da tela. Fotos é o último passo: só faz sentido com o resto preenchido. */
export type SecaoImovel = 'anuncio' | 'endereco' | 'medidas' | 'interno' | 'fotos'

export const SECOES_IMOVEL: readonly SecaoImovel[] = ['anuncio', 'endereco', 'medidas', 'interno', 'fotos']

/** Onde mora cada campo validado: é daqui que o bloco com erro sabe que precisa abrir. */
export const SECAO_DO_CAMPO: Record<CampoImovel, SecaoImovel> = {
  title: 'anuncio', type: 'anuncio', purpose: 'anuncio', price: 'anuncio',
  neighborhood: 'endereco', city: 'endereco', state: 'endereco', addressZip: 'endereco',
  area: 'medidas', bedrooms: 'medidas', suites: 'medidas', bathrooms: 'medidas', parking: 'medidas',
  ownerName: 'interno', ownerPhone: 'interno', brokerId: 'interno',
}

/** Só o primeiro bloco começa aberto; o resto aparece com resumo. `tudo` abre todos (tela somente leitura: o `fieldset disabled` da página desliga os cabeçalhos). */
export const secoesAbertasPadrao = (tudo = false): Record<SecaoImovel, boolean> => ({ anuncio: true, endereco: tudo, medidas: tudo, interno: tudo, fotos: tudo })

export function errosPorSecao(erros: Partial<Record<CampoImovel, string>>): Record<SecaoImovel, number> {
  const total: Record<SecaoImovel, number> = { anuncio: 0, endereco: 0, medidas: 0, interno: 0, fotos: 0 }
  for (const campo of Object.keys(erros) as CampoImovel[]) total[SECAO_DO_CAMPO[campo]]++
  return total
}

const juntar = (partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(' · ')
const contagem = (n: number | null, singular: string, plural: string) => (n ? `${n} ${n === 1 ? singular : plural}` : '')

/** Linha de resumo do bloco fechado; vazia quando ainda não há o que mostrar. */
export function resumoSecao(secao: Exclude<SecaoImovel, 'fotos'>, m: NovoImovel): string {
  if (secao === 'anuncio') return m.title.trim()
  if (secao === 'endereco') return juntar([m.neighborhood.trim(), [m.city.trim(), m.state.trim().toUpperCase()].filter(Boolean).join('/')])
  if (secao === 'medidas') return juntar([m.area ? `${m.area} m²` : '', contagem(m.bedrooms, 'quarto', 'quartos'), contagem(m.parking, 'vaga', 'vagas')])
  return m.ownerName.trim()
}

export const rotuloErrosSecao = (n: number): string => (n === 1 ? '1 campo a corrigir' : `${n} campos a corrigir`)
