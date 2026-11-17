import { formatarDocumento, tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'

/**
 * Consulta cadastral (SPC/Serasa) — SIMULADA.
 *
 * Nada aqui chama um bureau de crédito: o resultado sai de uma conta sobre os dígitos do
 * documento, para a mesma entrada dar sempre a mesma resposta e a Olmi poder validar a
 * tela. Toda consulta carrega `simulada: true` e a tela diz isso em destaque; no backend
 * este módulo é trocado pelo cliente do provedor e a tela não muda.
 *
 * LGPD: consultar o crédito de alguém exige finalidade declarada, e o histórico guarda o
 * documento MASCARADO, nunca inteiro (a política de privacidade não prevê a Olmi guardar
 * documento de terceiro que não virou contrato).
 */

export const FINALIDADES = ['Locação', 'Venda', 'Outra análise de crédito'] as const
export type Finalidade = (typeof FINALIDADES)[number]

export type SituacaoConsulta = 'sem-restricoes' | 'com-restricoes'

export interface Restricao {
  fonte: 'SPC' | 'Serasa'
  credor: string
  /** valor em reais */
  valor: number
  /** ISO yyyy-mm-dd */
  desde: string
}

export interface ConsultaFeita {
  id: string
  /** só as pontas do documento (CPF: 3 primeiros e 2 últimos); nunca inteiro */
  documentoMascarado: string
  tipo: 'cpf' | 'cnpj'
  finalidade: Finalidade
  /** contrato a que a consulta se refere (opcional) */
  contratoId: string | null
  quem: string
  /** dd/mm/aaaa hh:mm */
  quando: string
  situacao: SituacaoConsulta
  /** 0..1000 */
  score: number
  restricoes: Restricao[]
  simulada: true
}

export interface EntradaConsulta {
  documento: string
  finalidade: Finalidade | ''
  contratoId?: string | null
}

export type ResultadoConsulta = { ok: true; consulta: ConsultaFeita } | { ok: false; erro: string }

const digitos = (s: string) => s.replace(/\D/g, '')

// CPF `12345678909` vira `123.***.***-09`; CNPJ mantém os 2 primeiros e os 4 da filial mais o dígito.
export function mascararDocumento(documento: string): string {
  const d = digitos(documento)
  if (d.length === 11) return `${d.slice(0, 3)}.***.***-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-${d.slice(12)}`
  return '***'
}

/** Número estável a partir dos dígitos (a mesma entrada sempre dá o mesmo resultado). */
function semente(d: string): number {
  return [...d].reduce((h, c, i) => (h * 31 + Number(c) * (i + 7)) % 1_000_003, 17)
}

const CREDORES = ['Financeira Exemplo', 'Loja Exemplo', 'Telefonia Exemplo', 'Banco Exemplo']

/**
 * Cerca de 3 em cada 10 documentos saem com restrição. O ponto de corte é o resto da
 * semente por 10, para a demo mostrar os dois casos sem ninguém digitar nada especial.
 */
export function simularConsulta(documento: string): Pick<ConsultaFeita, 'situacao' | 'score' | 'restricoes'> {
  const d = digitos(documento)
  const s = semente(d)
  const com = s % 10 < 3
  const restricoes: Restricao[] = com
    ? Array.from({ length: 1 + (s % 3) }, (_, i) => ({
        fonte: (i % 2 === 0 ? 'SPC' : 'Serasa') as Restricao['fonte'],
        credor: CREDORES[(s + i) % CREDORES.length]!,
        valor: 200 + ((s * (i + 3)) % 4800),
        desde: `202${5 + (i % 2)}-${String(1 + ((s + i * 4) % 12)).padStart(2, '0')}-15`,
      }))
    : []
  const score = com ? 150 + (s % 350) : 550 + (s % 450)
  return { situacao: com ? 'com-restricoes' : 'sem-restricoes', score, restricoes }
}

export function realizarConsulta(
  entrada: EntradaConsulta,
  ator: { nome: string },
  quando: string,
  proximoId: string,
): ResultadoConsulta {
  const tipo = tipoDeDocumento(entrada.documento)
  if (!tipo) return { ok: false, erro: 'Informe um CPF ou CNPJ válido.' }
  if (!entrada.finalidade) return { ok: false, erro: 'Informe a finalidade da consulta.' }
  return {
    ok: true,
    consulta: {
      id: proximoId,
      documentoMascarado: mascararDocumento(entrada.documento),
      tipo,
      finalidade: entrada.finalidade,
      contratoId: entrada.contratoId || null,
      quem: ator.nome,
      quando,
      simulada: true,
      ...simularConsulta(entrada.documento),
    },
  }
}

export function proximoIdConsulta(feitas: ConsultaFeita[]): string {
  const maior = feitas.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 0)
  return `C-${String(maior + 1).padStart(4, '0')}`
}

export const ROTULO_SITUACAO_CONSULTA: Record<SituacaoConsulta, string> = {
  'sem-restricoes': 'Sem restrições',
  'com-restricoes': 'Com restrições',
}

export { formatarDocumento }
