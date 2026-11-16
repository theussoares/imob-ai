import { estadoRequisito, requisitoPorChave, type Requisito } from './requisitos.ts'
import type { Documento, Locacao } from './types'

/**
 * Itens e pendências por etapa da locação. Mesma ideia da venda: o estado do
 * item é derivado do arquivo (`Documento.requisito`), nunca um checkbox — uma
 * etapa concluída sem arquivo era afirmação sem prova.
 */

const pega = (...chaves: string[]) => chaves.map((c) => requisitoPorChave(c)!)

const POR_ETAPA: Record<number, string[]> = {
  2: ['locatario:rg-cnh', 'locatario:renda', 'locatario:residencia'],
  3: ['locador:rg-cnh', 'locador:certidao', 'locador:residencia'],
  4: ['locimovel:matricula', 'locimovel:iptu', 'locimovel:agua-luz'],
  5: ['locacao:garantia'],
}

export function requisitosDaEtapaLocacao(etapa: number): Requisito[] {
  return pega(...(POR_ETAPA[etapa] ?? []))
}

const vazio = (s: string | undefined) => !s?.trim()
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

export function pendenciasEtapaLocacao(l: Locacao, docs: Documento[], etapa: number): string[] {
  const out: string[] = []
  switch (etapa) {
    case 1:
      if (vazio(l.locador.nome)) out.push('Informe o locador.')
      if (vazio(l.locatario.nome)) out.push('Informe o locatário.')
      if (vazio(l.imovel)) out.push('Informe o imóvel.')
      return out
    case 2:
    case 3: {
      const quem = etapa === 2 ? 'locatario' : 'locador'
      const pessoa = l[quem]
      const rotulo = quem === 'locatario' ? 'locatário' : 'locador'
      if (vazio(pessoa.cpf)) out.push(`Preencha o CPF do ${rotulo} e salve o cadastro.`)
      if (vazio(pessoa.telefone)) out.push(`Preencha o telefone do ${rotulo} e salve o cadastro.`)
      if (vazio(pessoa.email)) out.push(`Preencha o e-mail do ${rotulo} e salve o cadastro.`)
      break
    }
    case 5:
      if (!l.garantia) out.push('Escolha o tipo de garantia e salve.')
      break
    case 6:
      if (!l.vistoriaEntrada) out.push('Registre a vistoria de entrada.')
      else if (!l.vistoriaEntrada.fotos.length) out.push('Anexe ao menos uma foto da vistoria.')
      return out
    case 7:
      if (!l.contrato) out.push('Salve os dados do contrato.')
      return out
  }
  const sem = requisitosDaEtapaLocacao(etapa).filter((r) => estadoRequisito(docs, l.id, r.chave) === 'pendente')
  if (sem.length) {
    out.push(
      `${plural(sem.length, 'Falta enviar 1 documento', `Faltam ${sem.length} documentos`)}: ${sem.map((r) => r.nome).join(', ')}.`,
    )
  }
  return out
}
