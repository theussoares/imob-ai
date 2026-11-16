// `.ts` explícito: este módulo é carregado pelo seed, que o mock lê em Node puro.
import { conferirFontes } from './commission.ts'
import type { CategoriaDocumento, Documento, EstadoDocumento, Processo } from './types'

/**
 * Itens de documento exigidos por etapa (2 a 5) e as pendências que impedem
 * concluir cada etapa.
 *
 * Por que o estado do item é DERIVADO dos documentos, e não um checkbox próprio:
 * um checkbox marcado sem arquivo é uma afirmação sem prova — foi exatamente o
 * defeito da primeira versão (etapa concluída sem nada enviado). Aqui o item só
 * conta como atendido se existe um arquivo ligado a ele (`Documento.requisito`).
 */

export interface Requisito {
  chave: string
  nome: string
  categoria: CategoriaDocumento
}

export type EstadoRequisito = 'pendente' | EstadoDocumento

const PESSOA = (quem: 'vendedor' | 'comprador'): Requisito[] => [
  // CPF não é arquivo: vira campo do cadastro (a Olmi não pede o papel do CPF).
  { chave: `${quem}:rg-cnh`, nome: 'RG ou CNH', categoria: 'pessoas' },
  { chave: `${quem}:certidao`, nome: 'Certidão de nascimento ou de casamento', categoria: 'pessoas' },
  { chave: `${quem}:residencia`, nome: 'Comprovante de residência', categoria: 'pessoas' },
]

const CATALOGO: Requisito[] = [
  ...PESSOA('vendedor'),
  ...PESSOA('comprador'),
  { chave: 'imovel:matricula', nome: 'Matrícula atualizada', categoria: 'imoveis' },
  { chave: 'imovel:matricula-mae', nome: 'Matrícula-mãe', categoria: 'imoveis' },
  { chave: 'imovel:prancha', nome: 'Projeto/prancha do imóvel', categoria: 'imoveis' },
  { chave: 'imovel:venal', nome: 'Comprovante do valor venal (IPTU)', categoria: 'imoveis' },
  { chave: 'imovel:agua-luz', nome: 'Comprovante de água e luz', categoria: 'imoveis' },
  { chave: 'fin:proposta', nome: 'Proposta assinada pelas partes', categoria: 'financeiro' },
  { chave: 'fin:simulacao', nome: 'Simulação de financiamento', categoria: 'financeiro' },
  { chave: 'fin:fgts', nome: 'Extrato do FGTS', categoria: 'financeiro' },
  { chave: 'fin:entrada', nome: 'Comprovante da entrada', categoria: 'financeiro' },
  // Locação (ver `locacao-requisitos.ts`).
  ...(['locatario', 'locador'] as const).flatMap((quem): Requisito[] => [
    { chave: `${quem}:rg-cnh`, nome: 'RG ou CNH', categoria: 'pessoas' },
    quem === 'locatario'
      ? { chave: 'locatario:renda', nome: 'Comprovante de renda', categoria: 'pessoas' }
      : { chave: 'locador:certidao', nome: 'Certidão de nascimento ou de casamento', categoria: 'pessoas' },
    { chave: `${quem}:residencia`, nome: 'Comprovante de residência', categoria: 'pessoas' },
  ]),
  { chave: 'locimovel:matricula', nome: 'Matrícula atualizada', categoria: 'imoveis' },
  { chave: 'locimovel:iptu', nome: 'IPTU', categoria: 'imoveis' },
  { chave: 'locimovel:agua-luz', nome: 'Comprovante de água e luz', categoria: 'imoveis' },
  { chave: 'locacao:garantia', nome: 'Comprovante da garantia', categoria: 'locacao' },
]

const POR_CHAVE = new Map(CATALOGO.map((r) => [r.chave, r]))
const pega = (...chaves: string[]) => chaves.map((c) => POR_CHAVE.get(c)!)

export const requisitoPorChave = (chave: string): Requisito | undefined => POR_CHAVE.get(chave)

type Base = Pick<Processo, 'matriculaMae' | 'fin'>

/**
 * Itens da etapa. A 4 muda com a matrícula (a mãe exige também o projeto) e a 5
 * com as fontes salvas: simulação só existe se há financiamento, extrato só se há
 * FGTS, comprovante só se há entrada — exigir o extrato de quem não usa FGTS
 * travaria a venda à vista sem motivo.
 */
export function requisitosDaEtapa(p: Base, etapa: number): Requisito[] {
  switch (etapa) {
    case 2:
      return pega('vendedor:rg-cnh', 'vendedor:certidao', 'vendedor:residencia')
    case 3:
      return pega('comprador:rg-cnh', 'comprador:certidao', 'comprador:residencia')
    case 4:
      return p.matriculaMae
        ? pega('imovel:matricula-mae', 'imovel:prancha', 'imovel:venal', 'imovel:agua-luz')
        : pega('imovel:matricula', 'imovel:venal', 'imovel:agua-luz')
    case 5:
      return pega(
        'fin:proposta',
        ...(p.fin.financiado > 0 ? ['fin:simulacao'] : []),
        ...(p.fin.fgts > 0 ? ['fin:fgts'] : []),
        ...(p.fin.entrada > 0 ? ['fin:entrada'] : []),
      )
    default:
      return []
  }
}

/** Arquivo ativo (fora da lixeira) que atende o item. Apagar o arquivo reabre a pendência. */
export function documentoDoRequisito(docs: Documento[], processoId: string, chave: string): Documento | undefined {
  return docs.find((d) => d.processoId === processoId && d.requisito === chave && !d.apagado)
}

export function estadoRequisito(docs: Documento[], processoId: string, chave: string): EstadoRequisito {
  return documentoDoRequisito(docs, processoId, chave)?.estado ?? 'pendente'
}

const vazio = (s: string | undefined) => !s?.trim()
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

/**
 * O que ainda impede concluir a etapa, em frases prontas para a tela. Vazio =
 * pode concluir. É a MESMA função que a tela usa para desabilitar o botão e que
 * `concluirEtapa` usa para recusar: a regra mora num lugar só.
 */
export function pendenciasEtapa(p: Processo, docs: Documento[], etapa: number): string[] {
  const out: string[] = []
  const faltam = (reqs: Requisito[]) => reqs.filter((r) => estadoRequisito(docs, p.id, r.chave) === 'pendente')

  switch (etapa) {
    case 1:
      if (vazio(p.vendedor.nome)) out.push('Informe o vendedor.')
      if (vazio(p.comprador.nome)) out.push('Informe o comprador.')
      if (vazio(p.imovel)) out.push('Informe o imóvel.')
      break
    case 2:
    case 3: {
      const quem = etapa === 2 ? 'vendedor' : 'comprador'
      const pessoa = p[quem]
      if (vazio(pessoa.cpf)) out.push(`Preencha o CPF do ${quem} e salve o cadastro.`)
      if (vazio(pessoa.telefone)) out.push(`Preencha o telefone do ${quem} e salve o cadastro.`)
      if (vazio(pessoa.email)) out.push(`Preencha o e-mail do ${quem} e salve o cadastro.`)
      break
    }
    case 4:
      if (!(p.valorVenal && p.valorVenal > 0)) out.push('Informe o valor venal e salve os dados do imóvel.')
      break
    case 5:
      if (p.valor <= 0) out.push('Informe o valor da venda e salve o checklist.')
      else if (!conferirFontes(p).fecha) out.push('As fontes de pagamento precisam fechar com o valor da venda.')
      break
    case 6: {
      // A recepção só fecha a conferência depois de olhar cada arquivo.
      const todos = [2, 3, 4, 5].flatMap((e) => requisitosDaEtapa(p, e))
      const semConferir = todos.filter((r) => estadoRequisito(docs, p.id, r.chave) !== 'conferido')
      if (semConferir.length) {
        out.push(`Ainda ${plural(semConferir.length, 'há 1 documento', `há ${semConferir.length} documentos`)} sem conferência.`)
      }
      return out
    }
    default:
      return out
  }

  const sem = faltam(requisitosDaEtapa(p, etapa))
  if (sem.length) {
    out.push(
      `${plural(sem.length, 'Falta enviar 1 documento', `Faltam ${sem.length} documentos`)}: ${sem.map((r) => r.nome).join(', ')}.`,
    )
  }
  return out
}

/**
 * Documentos de pessoas e do imóvel (etapas 2 a 4) ainda sem arquivo: o número do
 * aviso no card da lista. Processo encerrado não cobra mais nada.
 */
export function documentosPendentes(p: Processo, docs: Documento[]): number {
  if (p.status === 'Venda concluída' || p.status === 'Venda cancelada') return 0
  return [2, 3, 4].flatMap((e) => requisitosDaEtapa(p, e)).filter((r) => estadoRequisito(docs, p.id, r.chave) === 'pendente')
    .length
}
