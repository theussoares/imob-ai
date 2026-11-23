import { agora, type Ator, type Estado, type Resultado } from './acoes'
import { validarAdiantamento } from './commission'
import { bloqueioFinalizacao } from './analise-financeira'
import { statusFinal } from './status'
import { tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import type { ConferenciaFinal, FontesPagamento, FormaPagamento, GanhoCapital, Pessoa, Processo, ResponsavelAdiantamento } from './types'

/**
 * Transições da tela do processo (adiantamentos e checklist comercial).
 *
 * Ficam em arquivo próprio, e não em `acoes.ts`, porque a tela do processo foi
 * construída em paralelo com a lista e os documentos: mexer num arquivo comum
 * geraria conflito de merge na véspera da demonstração. Seguem o mesmo contrato
 * de `acoes.ts` — puras, devolvem `Resultado` e nunca mutam o estado recebido —
 * para o store aplicá-las com `aplicar()` sem saber a diferença.
 */

const MSG_FINAL = 'Este processo está encerrado e só aceita consulta.'
const MSG_NAO_ENCONTRADO = 'Processo não encontrado.'

const ROTULO_RESP: Record<ResponsavelAdiantamento, string> = {
  vendedor: 'vendedor',
  captador: 'captador',
  imob: 'imobiliária',
}

export const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Aplica `fn` ao processo e registra o evento no histórico. Centraliza a regra
 * «processo final é só leitura» para que nenhuma ação nova esqueça dela.
 */
export function alterar(
  estado: Estado,
  id: string,
  ator: Ator,
  quando: string,
  fn: (p: Processo) => { ok: true; processo: Processo; acao: string } | { ok: false; erro: string },
): Resultado {
  const p = estado.processos.find((x) => x.id === id)
  if (!p) return { ok: false, erro: MSG_NAO_ENCONTRADO }
  if (statusFinal(p.status)) return { ok: false, erro: MSG_FINAL }
  const r = fn(p)
  if (!r.ok) return r
  const novo: Processo = {
    ...r.processo,
    updated: quando,
    hist: [{ acao: r.acao, quem: ator.nome, quando }, ...p.hist],
  }
  return { ok: true, estado: { ...estado, processos: estado.processos.map((x) => (x.id === id ? novo : x)) } }
}

export const MSG_PAGO_SEM_COMPROVANTE = 'Anexe o comprovante para marcar como pago'

export interface NovoAdiantamento {
  resp: ResponsavelAdiantamento
  valor: number
  /** ISO yyyy-mm-dd */
  data: string
  /** ausente = adiantamento */
  momento?: 'adiantamento' | 'fim-contrato'
  pago?: boolean
  /** só o nome do arquivo: a demonstração não envia o binário */
  comprovante?: string | null
}

/** Próximo id `aN` acima do maior existente: nunca reaproveita o de um removido recente. */
function proximoIdAdiantamento(p: Processo): string {
  const maior = p.adiantamentos.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, '')) || 0), 0)
  return `a${maior + 1}`
}

export function registrarAdiantamento(
  estado: Estado,
  id: string,
  dados: NovoAdiantamento,
  ator: Ator,
  quando = agora(),
): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data) || Number.isNaN(Date.parse(dados.data))) {
      return { ok: false, erro: 'Informe a data do adiantamento.' }
    }
    // «Pago» sem comprovante seria uma afirmação sem prova: a Olmi só dá
    // baixa com o papel na mão, então a regra vale aqui e não só na tela.
    if (dados.pago && !dados.comprovante?.trim()) return { ok: false, erro: MSG_PAGO_SEM_COMPROVANTE }
    // Reaproveita a regra do domínio (valor > 0 e não passar do que resta da parte).
    const v = validarAdiantamento(p, dados)
    if (!v.ok) return v
    return {
      ok: true,
      acao: `Registrou adiantamento de ${brl(dados.valor)} (${ROTULO_RESP[dados.resp]})`,
      processo: {
        ...p,
        adiantamentos: [
          ...p.adiantamentos,
          {
            id: proximoIdAdiantamento(p),
            resp: dados.resp,
            valor: dados.valor,
            data: dados.data,
            quem: ator.nome,
            momento: dados.momento ?? 'adiantamento',
            pago: !!dados.pago,
            comprovante: dados.comprovante?.trim() || null,
          },
        ],
      },
    }
  })
}

/**
 * Dá baixa num adiantamento registrado como «não pago». A regra do `registrarAdiantamento` vale igual: sem
 * comprovante, não é pago. O comprovante pode já estar no registro (anexado antes de a baixa sair) ou vir agora.
 */
export function marcarAdiantamentoPago(
  estado: Estado,
  id: string,
  adiantamentoId: string,
  dados: { comprovante?: string | null },
  ator: Ator,
  quando = agora(),
): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    const a = p.adiantamentos.find((x) => x.id === adiantamentoId)
    if (!a) return { ok: false, erro: 'Adiantamento não encontrado.' }
    if (a.pago) return { ok: false, erro: 'Este adiantamento já está pago.' }
    const comprovante = dados.comprovante?.trim() || a.comprovante || null
    if (!comprovante) return { ok: false, erro: MSG_PAGO_SEM_COMPROVANTE }
    return {
      ok: true,
      acao: `Marcou como pago o adiantamento de ${brl(a.valor)} (${ROTULO_RESP[a.resp]})`,
      processo: { ...p, adiantamentos: p.adiantamentos.map((x) => (x.id === adiantamentoId ? { ...x, pago: true, comprovante } : x)) },
    }
  })
}

export function removerAdiantamento(
  estado: Estado,
  id: string,
  adiantamentoId: string,
  ator: Ator,
  quando = agora(),
): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    const a = p.adiantamentos.find((x) => x.id === adiantamentoId)
    if (!a) return { ok: false, erro: 'Adiantamento não encontrado.' }
    return {
      ok: true,
      acao: `Removeu adiantamento de ${brl(a.valor)} (${ROTULO_RESP[a.resp]})`,
      processo: { ...p, adiantamentos: p.adiantamentos.filter((x) => x.id !== adiantamentoId) },
    }
  })
}

export const FORMAS_PAGAMENTO: FormaPagamento[] = ['À vista', 'Financiamento', 'Misto']
export const OPCOES_GANHO: GanhoCapital[] = ['Isento', 'Há ganho de capital', 'Ainda não analisado']

export interface DadosFinanceiros {
  valor: number
  fin: FontesPagamento
}

/**
 * Salva valor, forma e fontes do checklist comercial. Não exige que as fontes
 * fechem com o valor: a recepção salva o rascunho e a tela mostra «Faltam R$»
 * (`conferirFontes`) — bloquear travaria quem ainda espera a simulação do banco.
 *
 * Valor reduzido abaixo do que já foi adiantado deixaria o restante da comissão
 * negativo, então é recusado.
 */
export function salvarFinanceiro(
  estado: Estado,
  id: string,
  dados: DadosFinanceiros,
  ator: Ator,
  quando = agora(),
): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    const { valor, fin } = dados
    const nums = [valor, fin.financiado, fin.entrada, fin.fgts, fin.proprios, fin.avaliacao ?? 0, fin.valorBem ?? 0]
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return { ok: false, erro: 'Os valores não podem ser negativos.' }
    if (!FORMAS_PAGAMENTO.includes(fin.forma)) return { ok: false, erro: 'Escolha a forma de pagamento.' }
    if (fin.ganho && !OPCOES_GANHO.includes(fin.ganho)) return { ok: false, erro: 'Ganho de capital inválido.' }
    if (valor <= 0) return { ok: false, erro: 'Informe o valor da venda.' }
    // Valor de bem sem dizer qual é (casa? carro?) não dá para conferir depois.
    if ((fin.valorBem ?? 0) > 0 && !fin.bem?.trim()) return { ok: false, erro: 'Descreva o bem dado na entrada.' }
    const adiantado = p.adiantamentos.reduce((t, a) => t + a.valor, 0)
    if (adiantado > (valor * p.pct) / 100) {
      return { ok: false, erro: 'A comissão desse valor ficaria menor que os adiantamentos já pagos.' }
    }
    return {
      ok: true,
      acao: 'Atualizou o checklist comercial',
      // À vista não tem parcela financiada: zera para não sobrar valor invisível na soma.
      processo: { ...p, valor, fin: { ...fin, financiado: fin.forma === 'À vista' ? 0 : fin.financiado } },
    }
  })
}

/**
 * Itens das etapas 6 e 7 (mock da demonstração). Os documentos das etapas 2 a 5
 * vivem em `requisitos.ts`, porque lá cada item tem arquivo e estado.
 */
export function itensChecklist(etapa: number): string[] {
  switch (etapa) {
    case 6:
      return ['Documentos conferidos com os originais', 'Dados do contrato batem com o cadastro', 'Fontes de pagamento fecham com o valor']
    case 7:
      return ['Matrícula sem ônus', 'Minuta do contrato revisada', 'Certidões das partes em dia']
    default:
      return []
  }
}

const SO_DIGITOS = (t: string) => t.replace(/\D/g, '')

export interface DadosPessoa {
  cpf: string
  telefone: string
  email: string
}

/**
 * Cadastro do vendedor (etapa 2) ou do comprador (etapa 3). Campo vazio é
 * aceito — o cadastro se completa aos poucos — mas o que for preenchido tem de
 * ter formato válido, senão a consulta cadastral (SPC/Serasa) falha lá na frente.
 */
export function salvarPessoa(
  estado: Estado,
  id: string,
  quem: 'vendedor' | 'comprador',
  dados: DadosPessoa,
  ator: Ator,
  quando = agora(),
): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    const cpf = dados.cpf.trim()
    const tel = dados.telefone.trim()
    const mail = dados.email.trim()
    if (cpf && !tipoDeDocumento(cpf)) return { ok: false, erro: 'CPF ou CNPJ inválido. Confira os dígitos.' }
    if (tel && ![10, 11].includes(SO_DIGITOS(tel).length)) return { ok: false, erro: 'Telefone deve ter DDD e 8 ou 9 dígitos.' }
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, erro: 'E-mail inválido.' }
    const atual: Pessoa = p[quem]
    return {
      ok: true,
      acao: `Atualizou o cadastro do ${quem}`,
      processo: { ...p, [quem]: { ...atual, cpf, telefone: tel, email: mail } },
    }
  })
}

export interface DadosImovel {
  matriculaMae: boolean
  valorVenal: number
}


export function salvarImovel(estado: Estado, id: string, dados: DadosImovel, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    if (!Number.isFinite(dados.valorVenal) || dados.valorVenal < 0) return { ok: false, erro: 'O valor venal não pode ser negativo.' }
    const novo: Processo = { ...p, matriculaMae: dados.matriculaMae, valorVenal: dados.valorVenal }
    return { ok: true, acao: 'Atualizou os dados do imóvel', processo: novo }
  })
}

/**
 * Conferência final (checklist da Olmi). «Encaminhado para finalização» é o
 * último passo: marcá-lo com documentação, valores ou comissão em aberto
 * mandaria ao jurídico um processo que a própria recepção não fechou.
 */
export function salvarConferenciaFinal(
  estado: Estado,
  id: string,
  dados: ConferenciaFinal,
  ator: Ator,
  quando = agora(),
): Resultado {
  return alterar(estado, id, ator, quando, (p) => {
    if (dados.encaminhado && !(dados.documentacao && dados.valores && dados.comissao)) {
      return { ok: false, erro: 'Confira documentação, valores e comissão antes de encaminhar para finalização.' }
    }
    const bloqueio = dados.encaminhado ? bloqueioFinalizacao(p.analiseFin) : null
    if (bloqueio) return { ok: false, erro: bloqueio }
    if (!dados.responsavel.trim()) return { ok: false, erro: 'Informe o responsável pela conferência.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data) || Number.isNaN(Date.parse(dados.data))) {
      return { ok: false, erro: 'Informe a data da conferência.' }
    }
    return {
      ok: true,
      acao: dados.encaminhado ? 'Encaminhou o processo para finalização' : 'Atualizou a conferência final',
      processo: { ...p, conferenciaFinal: { ...dados, responsavel: dados.responsavel.trim() } },
    }
  })
}
