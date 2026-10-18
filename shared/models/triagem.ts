import type { LeadType } from './lead'

/**
 * Triagem automática no WhatsApp (0064): três perguntas fixas, com botões,
 * antes de o corretor entrar. Fluxo fixo e não IA — ver a migration.
 *
 * Função pura: recebe onde a conversa está e o que a pessoa respondeu, devolve
 * o que mandar e para onde ir. O servidor só executa.
 */

export type TriagemModo = 'desligada' | 'fora_do_horario' | 'sempre'
export const TRIAGEM_MODOS: TriagemModo[] = ['desligada', 'fora_do_horario', 'sempre']
export const TRIAGEM_MODO_LABELS: Record<TriagemModo, string> = {
  desligada: 'Desligada',
  fora_do_horario: 'Só fora do horário comercial',
  sempre: 'Sempre, em toda conversa nova',
}

export type TriagemPasso = 'tipo' | 'faixa' | 'regiao' | 'concluida' | 'interrompida'
export const PASSOS_ATIVOS: TriagemPasso[] = ['tipo', 'faixa', 'regiao']

export type TriagemTipo = 'comprar' | 'alugar' | 'anunciar_venda' | 'anunciar_aluguel' | 'anunciar'

/** Sem resposta há mais que isto, a triagem desiste: a pessoa sumiu, e a próxima mensagem dela é conversa, não resposta. */
export const TRIAGEM_EXPIRA_MS = 2 * 60 * 60 * 1000

export interface EstadoDaTriagem {
  passo: TriagemPasso | null
  tipo: TriagemTipo | null
  faixa: string | null
  tentativas: number
}

export interface EntradaDaTriagem {
  /** id do botão ou da linha da lista, quando a pessoa tocou num. */
  respostaId: string | null
  texto: string | null
}

export type MensagemDaTriagem =
  | { tipo: 'texto'; corpo: string }
  | { tipo: 'botoes'; corpo: string; botoes: { id: string; titulo: string }[] }
  | { tipo: 'lista'; corpo: string; botao: string; linhas: { id: string; titulo: string }[] }

export interface ResultadoDaTriagem {
  estado: EstadoDaTriagem
  enviar: MensagemDaTriagem | null
  /** Preenchido quando o fluxo termina com as respostas. */
  concluida: { tipo: TriagemTipo; faixa: string | null; regiao: string } | null
}

export interface ContextoDaTriagem {
  nomeDaImobiliaria: string
  /** Primeiro nome já saneado, ou null. */
  nome: string | null
  dentroDoHorario: boolean
}

// Títulos: botão até 20 caracteres, linha de lista até 24 — limites da Meta.
const BOTOES_TIPO = [
  { id: 't_comprar', titulo: 'Comprar' },
  { id: 't_alugar', titulo: 'Alugar' },
  { id: 't_anunciar', titulo: 'Anunciar meu imóvel' },
]
const BOTOES_ANUNCIAR = [
  { id: 'o_venda', titulo: 'Quero vender' },
  { id: 'o_aluguel', titulo: 'Quero alugar' },
]
export const FAIXAS: Record<'comprar' | 'alugar', { id: string; titulo: string }[]> = {
  comprar: [
    { id: 'fc_1', titulo: 'Até R$ 300 mil' },
    { id: 'fc_2', titulo: 'R$ 300 a 600 mil' },
    { id: 'fc_3', titulo: 'R$ 600 mil a 1 milhão' },
    { id: 'fc_4', titulo: 'Acima de R$ 1 milhão' },
    { id: 'fc_0', titulo: 'Ainda não sei' },
  ],
  alugar: [
    { id: 'fa_1', titulo: 'Até R$ 1.500' },
    { id: 'fa_2', titulo: 'R$ 1.500 a 3.000' },
    { id: 'fa_3', titulo: 'R$ 3.000 a 5.000' },
    { id: 'fa_4', titulo: 'Acima de R$ 5.000' },
    { id: 'fa_0', titulo: 'Ainda não sei' },
  ],
}

export const TIPO_LABELS: Record<TriagemTipo, string> = {
  comprar: 'quer comprar',
  alugar: 'quer alugar',
  anunciar: 'quer anunciar um imóvel',
  anunciar_venda: 'quer vender um imóvel',
  anunciar_aluguel: 'quer pôr um imóvel para alugar',
}

export const TIPO_DO_LEAD: Record<TriagemTipo, LeadType> = {
  comprar: 'busca_compra',
  alugar: 'busca_aluguel',
  anunciar: 'indefinido',
  anunciar_venda: 'oferta_venda',
  anunciar_aluguel: 'oferta_aluguel',
}

/** "comprar", "quero alugar", "vender minha casa" digitados em vez de tocar no botão. */
function tipoPorTexto(texto: string): TriagemTipo | null {
  const t = texto.toLowerCase()
  if (/\balug/.test(t) && !/\b(anunc|vend)/.test(t)) return 'alugar'
  if (/\bcompr/.test(t)) return 'comprar'
  if (/\b(anunc|vend)/.test(t)) return 'anunciar'
  return null
}

function inicio(ctx: ContextoDaTriagem): MensagemDaTriagem {
  return {
    tipo: 'botoes',
    corpo: `Olá${ctx.nome ? `, ${ctx.nome}` : ''}! Aqui é da ${ctx.nomeDaImobiliaria}. Para te atender mais rápido, me conta: o que você procura?`,
    botoes: BOTOES_TIPO,
  }
}

function perguntaDoPasso2(tipo: TriagemTipo): MensagemDaTriagem {
  if (tipo === 'anunciar') return { tipo: 'botoes', corpo: 'Você quer vender ou alugar o seu imóvel?', botoes: BOTOES_ANUNCIAR }
  const f = tipo === 'alugar' ? FAIXAS.alugar : FAIXAS.comprar
  return {
    tipo: 'lista',
    corpo: tipo === 'alugar' ? 'Qual valor de aluguel por mês você procura?' : 'Qual faixa de valor você procura?',
    botao: 'Ver faixas',
    linhas: f,
  }
}

function perguntaRegiao(tipo: TriagemTipo): MensagemDaTriagem {
  return {
    tipo: 'texto',
    corpo: tipo.startsWith('anunciar') ? 'Em qual bairro fica o imóvel?' : 'Em qual bairro ou região você procura?',
  }
}

function despedida(ctx: ContextoDaTriagem): MensagemDaTriagem {
  return {
    tipo: 'texto',
    corpo: ctx.dentroDoHorario
      ? 'Obrigado! Já passei tudo para a equipe — um corretor fala com você em instantes.'
      : 'Obrigado! Já passei tudo para a equipe — um corretor fala com você no próximo horário de atendimento.',
  }
}

/** Resposta fora do roteiro: pergunta de novo uma vez; na segunda, desiste com educação. */
function foraDoRoteiro(e: EstadoDaTriagem, repetir: MensagemDaTriagem, ctx: ContextoDaTriagem): ResultadoDaTriagem {
  if (e.tentativas >= 1) {
    return {
      estado: { ...e, passo: 'interrompida' },
      enviar: { tipo: 'texto', corpo: `Tudo bem! Um corretor da ${ctx.nomeDaImobiliaria} vai continuar a conversa com você por aqui.` },
      concluida: null,
    }
  }
  return { estado: { ...e, tentativas: e.tentativas + 1 }, enviar: repetir, concluida: null }
}

export function passoDaTriagem(e: EstadoDaTriagem, entrada: EntradaDaTriagem, ctx: ContextoDaTriagem): ResultadoDaTriagem {
  const id = entrada.respostaId
  const texto = (entrada.texto ?? '').trim()

  if (e.passo === null) return { estado: { passo: 'tipo', tipo: null, faixa: null, tentativas: 0 }, enviar: inicio(ctx), concluida: null }

  if (e.passo === 'tipo') {
    const tipo: TriagemTipo | null =
      id === 't_comprar' ? 'comprar' : id === 't_alugar' ? 'alugar' : id === 't_anunciar' ? 'anunciar' : texto ? tipoPorTexto(texto) : null
    if (!tipo) return foraDoRoteiro(e, inicio(ctx), ctx)
    return { estado: { passo: 'faixa', tipo, faixa: null, tentativas: 0 }, enviar: perguntaDoPasso2(tipo), concluida: null }
  }

  if (e.passo === 'faixa' && e.tipo) {
    if (e.tipo === 'anunciar') {
      const t: TriagemTipo | null =
        id === 'o_venda' || /\bvend/i.test(texto) ? 'anunciar_venda' : id === 'o_aluguel' || /\balug/i.test(texto) ? 'anunciar_aluguel' : null
      if (!t) return foraDoRoteiro(e, perguntaDoPasso2(e.tipo), ctx)
      return { estado: { ...e, passo: 'regiao', tipo: t, tentativas: 0 }, enviar: perguntaRegiao(t), concluida: null }
    }
    const faixas = e.tipo === 'alugar' ? FAIXAS.alugar : FAIXAS.comprar
    const faixa = faixas.find((f) => f.id === id)?.titulo ?? null
    if (!faixa) return foraDoRoteiro(e, perguntaDoPasso2(e.tipo), ctx)
    return { estado: { ...e, passo: 'regiao', faixa, tentativas: 0 }, enviar: perguntaRegiao(e.tipo), concluida: null }
  }

  if (e.passo === 'regiao' && e.tipo) {
    // Texto livre, curto: é bairro, não redação. Um parágrafo aqui é a pessoa
    // conversando — melhor o corretor ler do que o robô guardar como "bairro".
    if (!texto || texto.length > 80) return foraDoRoteiro(e, perguntaRegiao(e.tipo), ctx)
    return {
      estado: { ...e, passo: 'concluida' },
      enviar: despedida(ctx),
      concluida: { tipo: e.tipo, faixa: e.faixa, regiao: texto },
    }
  }

  return { estado: e, enviar: null, concluida: null }
}

/** O que vai para o histórico do contato ao terminar. */
export function resumoDaTriagem(c: { tipo: TriagemTipo; faixa: string | null; regiao: string }): string {
  return ['Triagem pelo WhatsApp', TIPO_LABELS[c.tipo], c.faixa && c.faixa !== 'Ainda não sei' ? c.faixa : null, `bairro: ${c.regiao}`]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Horário comercial de imobiliária: seg a sex das 8h às 18h, sábado das 8h
 * ao meio-dia, no horário de Brasília. Fixo por ora — é o horário da grande
 * maioria, e configurar por imobiliária pode vir quando alguém pedir.
 */
export function dentroDoHorarioComercial(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(agora)
  const dia = partes.find((p) => p.type === 'weekday')?.value
  const hora = Number(partes.find((p) => p.type === 'hour')?.value)
  if (dia === 'Sun') return false
  if (dia === 'Sat') return hora >= 8 && hora < 12
  return hora >= 8 && hora < 18
}
