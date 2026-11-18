import { agora, type Ator, type Estado, type Resultado } from './acoes.ts'
import { pendenciasEtapaLocacao } from './locacao-requisitos.ts'
import { locacaoFinal, statusPorEtapa, TOTAL_ETAPAS_LOCACAO } from './locacao-status.ts'
import { requisitoPorChave } from './requisitos.ts'
import { aplicarPagamento, totalPago, validarPagamento, type DadosPagamento } from './cobranca.ts'
import type { CategoriaDocumento, Cobranca, ContratoLocacao, Documento, Locacao, Pessoa, TipoGarantia, Vistoria } from './types'

/**
 * Transições da locação, puras como as da venda (`acoes.ts`): recebem o estado e
 * devolvem outro, e é aqui que mora a regra. A tela só liga as funções aos botões.
 * Permissão (quem vê valores, quem arquiva) é da tela/servidor, não daqui.
 */

const MSG_FINAL = 'Esta locação está encerrada e só aceita consulta.'
const MSG_NAO_ENCONTRADA = 'Locação não encontrada.'
const SO_DIGITOS = (t: string) => t.replace(/\D/g, '')
const ISO = /^\d{4}-\d{2}-\d{2}$/
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/

type Mudanca = { ok: true; locacao: Locacao; acao: string } | { ok: false; erro: string }

function gravar(estado: Estado, id: string, novo: Locacao): Estado {
  return { ...estado, locacoes: estado.locacoes.map((l) => (l.id === id ? novo : l)) }
}

/**
 * Aplica `fn` e registra o evento. Centraliza «encerrada é só leitura» e o
 * recálculo do status, para nenhuma ação nova esquecer de um dos dois.
 */
function alterar(estado: Estado, id: string, ator: Ator, quando: string, fn: (l: Locacao) => Mudanca): Resultado {
  const l = estado.locacoes.find((x) => x.id === id)
  if (!l) return { ok: false, erro: MSG_NAO_ENCONTRADA }
  if (locacaoFinal(l.status)) return { ok: false, erro: MSG_FINAL }
  const r = fn(l)
  if (!r.ok) return r
  const feito = r.locacao
  const novo: Locacao = {
    ...feito,
    status: locacaoFinal(feito.status) ? feito.status : statusPorEtapa(feito.etapa, feito.concluidas),
    updated: quando,
    hist: [{ acao: r.acao, quem: ator.nome, quando }, ...l.hist],
  }
  return { ok: true, estado: gravar(estado, id, novo) }
}

/** Próximo número no padrão L-AAAA-NNNN, sempre acima do maior existente. */
export function proximoIdLocacao(locacoes: Locacao[], ano = new Date().getFullYear()): string {
  const prefixo = `L-${ano}-`
  const maior = locacoes
    .filter((l) => l.id.startsWith(prefixo))
    .reduce((m, l) => Math.max(m, Number(l.id.slice(prefixo.length)) || 0), 0)
  return `${prefixo}${String(maior + 1).padStart(4, '0')}`
}

export interface NovaLocacao {
  locador: string
  locatario: string
  imovelId: string
  imovel: string
  corretorId: string
}

export function abrirLocacao(estado: Estado, d: NovaLocacao, ator: Ator, quando = agora()): Resultado {
  if (!d.locador.trim()) return { ok: false, erro: 'Informe o locador.' }
  if (!d.locatario.trim()) return { ok: false, erro: 'Informe o locatário.' }
  if (!d.imovel.trim() || !d.imovelId.trim()) return { ok: false, erro: 'Informe o imóvel.' }
  const nova: Locacao = {
    id: proximoIdLocacao(estado.locacoes),
    tipo: 'locacao',
    locador: { nome: d.locador.trim(), cpf: '' },
    locatario: { nome: d.locatario.trim(), cpf: '' },
    imovelId: d.imovelId,
    imovel: d.imovel.trim(),
    corretorId: d.corretorId,
    status: 'Em abertura',
    updated: quando,
    etapa: 1,
    concluidas: Array.from({ length: TOTAL_ETAPAS_LOCACAO }, () => false),
    cobrancas: [],
    hist: [{ acao: 'Abriu a locação', quem: ator.nome, quando }],
    obs: '',
    arquivado: false,
  }
  return { ok: true, estado: { ...estado, locacoes: [nova, ...estado.locacoes] } }
}

export interface DadosAberturaLocacao {
  locador: Pessoa
  locatario: Pessoa
  imovelId: string
  imovel: string
  corretorId: string
}

export function salvarAberturaLocacao(estado: Estado, id: string, d: DadosAberturaLocacao, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    if (!d.locador.nome.trim()) return { ok: false, erro: 'Informe o locador.' }
    if (!d.locatario.nome.trim()) return { ok: false, erro: 'Informe o locatário.' }
    if (!d.imovel.trim()) return { ok: false, erro: 'Informe o imóvel.' }
    for (const [rot, p] of [['locador', d.locador], ['locatário', d.locatario]] as const) {
      if (p.cpf.trim() && ![11, 14].includes(SO_DIGITOS(p.cpf).length)) {
        return { ok: false, erro: `CPF ou CNPJ do ${rot} deve ter 11 ou 14 dígitos.` }
      }
    }
    return { ok: true, acao: 'Atualizou os dados da abertura', locacao: { ...l, ...d } }
  })
}

export function salvarGarantia(estado: Estado, id: string, d: { tipo: TipoGarantia; detalhe: string }, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => ({
    ok: true,
    acao: `Registrou a garantia (${d.tipo})`,
    locacao: { ...l, garantia: { tipo: d.tipo, detalhe: d.detalhe.trim() } },
  }))
}

export function salvarVistoria(estado: Estado, id: string, quando: 'entrada' | 'saida', d: Vistoria, ator: Ator, agoraTexto = agora()): Resultado {
  return alterar(estado, id, ator, agoraTexto, (l) => {
    if (quando === 'saida' && !l.concluidas[6]) return { ok: false, erro: 'A vistoria de saída só vale depois do contrato.' }
    if (!ISO.test(d.data)) return { ok: false, erro: 'Informe a data da vistoria.' }
    if (!d.responsavel.trim()) return { ok: false, erro: 'Informe quem fez a vistoria.' }
    const v: Vistoria = { ...d, responsavel: d.responsavel.trim(), observacao: d.observacao.trim() }
    return quando === 'entrada'
      ? { ok: true, acao: 'Registrou a vistoria de entrada', locacao: { ...l, vistoriaEntrada: v } }
      : { ok: true, acao: 'Registrou a vistoria de saída', locacao: { ...l, vistoriaSaida: v } }
  })
}

export function salvarContrato(estado: Estado, id: string, d: ContratoLocacao, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    // `v-model.number` entrega '' (ou null) com o campo apagado, e '' passa em `>= 0`: a taxa viraria 0%.
    const numero = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
    if (!numero(d.valor) || !(d.valor > 0)) return { ok: false, erro: 'Informe o valor do aluguel.' }
    if (!numero(d.diaVencimento) || !Number.isInteger(d.diaVencimento) || d.diaVencimento < 1 || d.diaVencimento > 28) {
      return { ok: false, erro: 'O dia de vencimento deve ficar entre 1 e 28.' }
    }
    if (!ISO.test(d.inicio) || !ISO.test(d.fim)) return { ok: false, erro: 'Informe o início e o fim do contrato.' }
    if (d.fim <= d.inicio) return { ok: false, erro: 'O fim do contrato deve ser depois do início.' }
    if (!numero(d.taxaPct) || !(d.taxaPct >= 0 && d.taxaPct <= 100)) return { ok: false, erro: 'A taxa da imobiliária deve ficar entre 0 e 100%.' }
    return { ok: true, acao: 'Salvou os dados do contrato', locacao: { ...l, contrato: d } }
  })
}

const arredonda = (n: number) => Math.round(n * 100) / 100

export function gerarCobranca(estado: Estado, id: string, competencia: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    if (!l.contrato) return { ok: false, erro: 'Salve os dados do contrato antes de gerar cobranças.' }
    if (!COMPETENCIA.test(competencia)) return { ok: false, erro: 'Competência inválida. Use AAAA-MM.' }
    if (l.cobrancas.some((c) => c.competencia === competencia)) {
      return { ok: false, erro: `Já existe cobrança para ${competencia}.` }
    }
    const cobranca: Cobranca = {
      id: `cb-${competencia}`,
      competencia,
      valor: l.contrato.valor,
      vencimento: `${competencia}-${String(l.contrato.diaVencimento).padStart(2, '0')}`,
    }
    const cobrancas = [...l.cobrancas, cobranca].sort((x, y) => x.competencia.localeCompare(y.competencia))
    return { ok: true, acao: `Gerou a cobrança de ${competencia}`, locacao: { ...l, cobrancas } }
  })
}

function naCobranca(l: Locacao, cobrancaId: string, fn: (c: Cobranca) => Cobranca | string): Mudanca & { competencia?: string } {
  const c = l.cobrancas.find((x) => x.id === cobrancaId)
  if (!c) return { ok: false, erro: 'Cobrança não encontrada.' }
  const r = fn(c)
  if (typeof r === 'string') return { ok: false, erro: r }
  return { ok: true, acao: c.competencia, locacao: { ...l, cobrancas: l.cobrancas.map((x) => (x.id === cobrancaId ? r : x)) } }
}

/** Hoje (ISO) no fuso do painel, tirado do rótulo `dd/mm/aaaa hh:mm` que o servidor/mock já passa. */
const hojeDe = (quando: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(quando)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export type DadosRecebimento = DadosPagamento

/**
 * Registra um recebimento (parcial ou total). Só quita — marca `pago` e libera o repasse — quando a
 * soma recebida cobre o valor atualizado na data do pagamento; até lá a cobrança fica «Parcial» com
 * o saldo em aberto. Repasse só depois de quitada (o mais simples: sem repasse proporcional, que
 * obrigaria a refazer a conta a cada parcela). O comprovante é opcional.
 */
export function registrarPagamento(estado: Estado, id: string, cobrancaId: string, d: DadosRecebimento & { cobrancaId?: string }, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    const erro = validarPagamento(d, hojeDe(quando))
    if (erro) return { ok: false, erro }
    const taxa = l.contrato?.taxaPct ?? 0
    const r = naCobranca(l, cobrancaId, (c) => {
      if (c.pago) return 'Esta cobrança já está paga.'
      const comprovante = d.comprovante?.trim() || null
      const idPag = `pg-${(c.pagamentos?.length ?? 0) + 1}`
      const { cobranca, quitou, atualizado } = aplicarPagamento(c, { id: idPag, valor: arredonda(d.valor), data: d.data, forma: d.forma, comprovante }, estado.encargos)
      if (totalPago(cobranca) > atualizado + 0.004) return `O valor passa do total devido (${brl(arredonda(atualizado - totalPago(c)))}).`
      if (!quitou) return cobranca
      return {
        ...cobranca,
        pago: { data: d.data, comprovante: cobranca.pagamentos!.find((p) => p.comprovante)?.comprovante ?? '' },
        repasse: { valor: arredonda(c.valor - (c.valor * taxa) / 100), feito: false },
      }
    })
    if (!r.ok) return r
    const c = r.locacao.cobrancas.find((x) => x.id === cobrancaId)!
    const parcial = !c.pago
    // Sem o valor no texto: o `hist` chega inteiro a perfis sem `valores` (o recorte só cobre contrato e cobranças).
    return { ...r, acao: `${parcial ? 'Registrou pagamento parcial' : 'Registrou o pagamento'} de ${r.acao} (${d.forma})` }
  })
}

/** Repasse ao locador: só depois de quitada; pode ser parcial; `feito` quando a soma cobre o devido. */
export function registrarRepasse(estado: Estado, id: string, cobrancaId: string, d: DadosRecebimento & { cobrancaId?: string }, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    const erro = validarPagamento(d, hojeDe(quando))
    if (erro) return { ok: false, erro }
    const r = naCobranca(l, cobrancaId, (c) => {
      if (!c.pago || !c.repasse) return 'Quite a cobrança antes do repasse.'
      if (c.repasse.feito) return 'O repasse desta cobrança já foi feito.'
      const ja = c.repasse.repassado ?? 0
      const falta = arredonda(c.repasse.valor - ja)
      if (d.valor > falta + 0.004) return `O repasse passa do que falta repassar (${brl(falta)}).`
      const repassado = arredonda(ja + d.valor)
      return { ...c, repasse: { ...c.repasse, repassado, feito: repassado + 0.004 >= c.repasse.valor, data: d.data, forma: d.forma, comprovante: d.comprovante?.trim() || null } }
    })
    return r.ok ? { ...r, acao: `Registrou o repasse de ${r.acao} (${d.forma})` } : r
  })
}

export function concluirEtapaLocacao(estado: Estado, id: string, etapa: number, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    if (etapa < 1 || etapa >= TOTAL_ETAPAS_LOCACAO) return { ok: false, erro: 'Esta etapa não se conclui; use renovar ou encerrar.' }
    if (etapa !== l.etapa) {
      return { ok: false, erro: l.concluidas[etapa - 1] ? 'Esta etapa já está concluída.' : 'Conclua as etapas anteriores primeiro.' }
    }
    const pendencias = pendenciasEtapaLocacao(l, estado.documentos, etapa)
    if (pendencias.length) return { ok: false, erro: pendencias[0]! }
    const concluidas = l.concluidas.map((c, i) => (i === etapa - 1 ? true : c))
    return { ok: true, acao: `Concluiu a etapa ${etapa}`, locacao: { ...l, concluidas, etapa: etapa + 1 } }
  })
}

/** Soma 12 meses a uma data ISO; 29/02 cai em 28/02 nos anos sem bissexto. */
function maisDozeMeses(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number]
  const ano = a + 1
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
  const dia = m === 2 && d === 29 && !bissexto ? 28 : d
  return `${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function renovarLocacao(estado: Estado, id: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    if (l.status !== 'Ativa' || !l.contrato) return { ok: false, erro: 'Só locação ativa pode ser renovada.' }
    return {
      ok: true,
      acao: 'Renovou o contrato por 12 meses',
      locacao: { ...l, contrato: { ...l.contrato, fim: maisDozeMeses(l.contrato.fim) } },
    }
  })
}

export function encerrarLocacao(estado: Estado, id: string, ator: Ator, quando = agora()): Resultado {
  return alterar(estado, id, ator, quando, (l) => {
    if (l.status !== 'Ativa') return { ok: false, erro: 'Só locação ativa pode ser encerrada.' }
    if (!l.vistoriaSaida) return { ok: false, erro: 'Registre a vistoria de saída antes de encerrar.' }
    if (l.cobrancas.some((c) => c.pago && c.repasse && !c.repasse.feito)) {
      return { ok: false, erro: 'Há repasse pendente ao proprietário.' }
    }
    return {
      ok: true,
      acao: 'Encerrou a locação',
      locacao: { ...l, status: 'Encerrada', concluidas: l.concluidas.map(() => true) },
    }
  })
}

function trocarArquivada(estado: Estado, id: string, arquivado: boolean, ator: Ator, quando: string): Resultado {
  const l = estado.locacoes.find((x) => x.id === id)
  if (!l) return { ok: false, erro: MSG_NAO_ENCONTRADA }
  if (arquivado) {
    if (!locacaoFinal(l.status)) return { ok: false, erro: 'Só dá para arquivar locação encerrada.' }
    if (l.arquivado) return { ok: false, erro: 'Esta locação já está arquivada.' }
  } else if (!l.arquivado) {
    return { ok: false, erro: 'Esta locação não está arquivada.' }
  }
  const acao = arquivado ? 'Arquivou a locação' : 'Restaurou a locação dos arquivados'
  return { ok: true, estado: gravar(estado, id, { ...l, arquivado, updated: quando, hist: [{ acao, quem: ator.nome, quando }, ...l.hist] }) }
}

export const arquivarLocacao = (e: Estado, id: string, a: Ator, q = agora()) => trocarArquivada(e, id, true, a, q)
export const restaurarLocacao = (e: Estado, id: string, a: Ator, q = agora()) => trocarArquivada(e, id, false, a, q)

/**
 * `acoes.enviarDocumento` exige um processo de venda; a locação tem a sua porta.
 * Conferir e substituir arquivo não dependem do processo e são reaproveitados.
 */
export function enviarDocumentoLocacao(
  estado: Estado,
  dados: { nome: string; categoria: CategoriaDocumento; processoId: string; tamanho: number; requisito?: string },
  ator: Ator,
  quando = agora(),
): Resultado {
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(dados.nome.trim())) return { ok: false, erro: 'Use PDF, JPG, PNG ou WEBP.' }
  if (dados.tamanho > 15 * 1024 * 1024) return { ok: false, erro: 'O arquivo passa de 15 MB.' }
  const req = dados.requisito ? requisitoPorChave(dados.requisito) : undefined
  if (dados.requisito && !req) return { ok: false, erro: 'Item de checklist desconhecido.' }
  const r = alterar(estado, dados.processoId, ator, quando, (l) => ({
    ok: true,
    acao: `Enviou o documento: ${req?.nome ?? dados.nome.trim()}`,
    locacao: l,
  }))
  if (!r.ok) return r
  const documento: Documento = {
    id: `d${estado.documentos.length + 1}-${Date.now().toString(36)}`,
    nome: dados.nome.trim(),
    // O item manda na categoria: o RG aparece em «Pessoas» mesmo que quem enviou não tenha escolhido.
    categoria: req?.categoria ?? dados.categoria,
    ...(req && { requisito: req.chave }),
    processoId: dados.processoId,
    estado: 'enviado',
    tamanho: dados.tamanho,
    versoes: 1,
    enviadoPor: ator.nome,
    apagado: null,
  }
  return { ok: true, estado: { ...r.estado, documentos: [documento, ...r.estado.documentos] } }
}
