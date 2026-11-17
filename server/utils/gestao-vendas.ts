import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { abrirProcesso, agora, type Estado } from '~~/layers/gestao/domain/acoes'
import { capacidades } from '~~/layers/gestao/domain/permissions'
import type { Documento, MatrizPermissoes, Processo, Sessao } from '~~/layers/gestao/domain/types'
import { recortarValores, type ProcessoSemValores, type Venda } from '~~/server/mappers/gestao-venda'
import {
  buscarVenda,
  corretoresDoTenant,
  gravarVenda,
  idsDoAno,
  inserirVenda,
  listarVendas,
  type Escopo,
} from '~~/server/repositories/gestao-venda.repository'
import { amarrar, executarAcao } from '~~/server/utils/gestao-acoes'
import { ACOES_VENDA, nomeAcaoValido } from '~~/server/utils/gestao-vendas-acoes'

/**
 * Serviço de vendas do gestão: o que os endpoints `/api/gestao/vendas/**` fazem,
 * separado do h3 para testar em Node puro. As dependências da F1 (`registrarEvento`,
 * leitura de configurações) entram por parâmetro: o endpoint passa as reais, o
 * teste passa dublês, e este arquivo não importa `gestao-auth.ts`.
 */

/** O que o serviço precisa do `ContextoGestao` da F1 (estruturalmente compatível com ele). */
export interface CtxVendas {
  membro: { userId: string; tenantId: string; nome: string; brokerId: string | null }
  matriz: MatrizPermissoes
  sessao: Sessao
  db: SupabaseClient
}

export interface DepsVendas {
  registrarEvento: (
    db: SupabaseClient,
    tenantId: string,
    e: { atorUserId: string; atorNome: string; acao: string; alvoTipo: 'venda'; alvoId: string },
  ) => Promise<void>
  /** % de comissão padrão das configurações do tenant. */
  comissaoPadrao: (db: SupabaseClient, tenantId: string) => Promise<number>
  /**
   * Documentos do processo, para `concluirEtapa` conferir o checklist das etapas 2–5.
   * Hoje devolve `[]`: a tabela `gestao_documentos` é da F3. Sem isso as etapas 2–5
   * não concluem pela API até a F3 trocar esta função (única costura).
   */
  documentosDoProcesso?: (db: SupabaseClient, tenantId: string, processoId: string) => Promise<Documento[]>
  agora?: () => Date
}

export interface VendaResposta {
  versao: number
  processo: Processo | ProcessoSemValores
}

/** Últimos 2 dígitos aparecem; o resto vira «*». Vazio continua vazio. */
export const mascararCpf = (cpf: string): string => {
  const d = cpf.replace(/\D/g, '')
  return d.length < 4 ? (cpf ? '***' : '') : `${'*'.repeat(d.length - 2)}${d.slice(-2)}`
}

/** Listagem: CPF/CNPJ das partes mascarado (regra do plano). O detalhe (`GET /vendas/:id`) traz inteiro. */
const mascarada = (r: VendaResposta): VendaResposta => ({
  ...r,
  processo: {
    ...r.processo,
    vendedor: { ...r.processo.vendedor, cpf: mascararCpf(r.processo.vendedor.cpf) },
    comprador: { ...r.processo.comprador, cpf: mascararCpf(r.processo.comprador.cpf) },
  },
})

const resposta = (v: Venda, podeValores: boolean): VendaResposta => ({
  versao: v.versao,
  processo: recortarValores(v.processo, podeValores),
})

/** Corretor sem `verTodos` só enxerga o que é seu; sem vínculo com corretor, nada. */
const SEM_CORRETOR = '00000000-0000-0000-0000-000000000000'

function escopoDe(ctx: CtxVendas): Escopo {
  const todos = ctx.matriz.verTodos?.[ctx.sessao.perfil] === 'sim'
  return { tenantId: ctx.membro.tenantId, ...(todos ? {} : { corretorId: ctx.membro.brokerId ?? SEM_CORRETOR }) }
}

const proibido = (msg = 'Você não tem permissão para isto.') => createError({ statusCode: 403, statusMessage: msg })

async function evento(ctx: CtxVendas, deps: DepsVendas, acao: string, alvoId: string) {
  try {
    await deps.registrarEvento(ctx.db, ctx.membro.tenantId, {
      atorUserId: ctx.membro.userId,
      atorNome: ctx.membro.nome,
      acao,
      alvoTipo: 'venda',
      alvoId,
    })
  } catch (e) {
    // A escrita já aconteceu; devolver 500 faria o usuário repetir uma ação que
    // valeu (e o 2º envio bateria 409). O `hist` do agregado segue sendo a
    // auditoria visível, e o erro vai para o log para alguém consertar.
    logError('gestao_evento_falhou', { tenantId: ctx.membro.tenantId, acao, erro: errMessage(e) })
  }
}

export async function listarVendasDoMembro(
  ctx: CtxVendas,
  filtro: { arquivados: boolean },
): Promise<VendaResposta[]> {
  const c = capacidades(ctx.matriz, ctx.sessao)
  // Mesmo critério do menu «Arquivados» (`menuVisivel`).
  if (filtro.arquivados && !(c.arquivar || c.apagarDocs)) throw proibido()
  const vendas = await listarVendas(ctx.db, escopoDe(ctx), { arquivado: filtro.arquivados })
  return vendas.map((v) => mascarada(resposta(v, c.valores)))
}

/** Formato de `proximoId`. Id fora dele nem chega ao banco: 404 igual a «não existe». */
const ID_VENDA = /^V-\d{4}-\d{4,}$/
const naoEncontrado = () => createError({ statusCode: 404, statusMessage: 'Não encontrado.' })

/** Id de rota de venda conferido (V-AAAA-NNNN, não uuid). Fora do formato = 404, igual a «não existe». */
export function idDeVenda(valor: string | null | undefined): string {
  const id = (valor || '').trim()
  if (!ID_VENDA.test(id)) throw naoEncontrado()
  return id
}

export async function lerVendaDoMembro(ctx: CtxVendas, id: string): Promise<VendaResposta> {
  if (!ID_VENDA.test(id)) throw naoEncontrado()
  const v = await buscarVenda(ctx.db, escopoDe(ctx), id)
  // 404 e não 403: o corretor B não descobre que o processo do corretor A existe.
  if (!v) throw naoEncontrado()
  return resposta(v, capacidades(ctx.matriz, ctx.sessao).valores)
}

const novoSchema = z.object({
  imovel: z.string().max(500),
  vendedor: z.string().max(500),
  comprador: z.string().max(500),
  corretorId: z.string().max(64).optional(),
  captadorId: z.string().max(64).optional(),
})

const invalido = (msg: string) => createError({ statusCode: 422, statusMessage: msg, data: { erro: msg } })

export async function abrirVendaDoMembro(ctx: CtxVendas, corpo: unknown, deps: DepsVendas): Promise<VendaResposta> {
  const c = capacidades(ctx.matriz, ctx.sessao)
  if (!c.criar) throw proibido()
  const parsed = novoSchema.safeParse(corpo)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Dados inválidos.' })
  const dados = parsed.data

  // Quem não vê todos abre sempre em seu próprio nome: aceitar `corretorId` do
  // corpo deixaria o corretor A abrir processo na carteira do B.
  const veTodos = ctx.matriz.verTodos?.[ctx.sessao.perfil] === 'sim'
  const corretorId = veTodos ? (dados.corretorId ?? ctx.membro.brokerId) : ctx.membro.brokerId
  if (!corretorId) throw invalido('Escolha o corretor.')
  const captadorId = dados.captadorId ?? corretorId

  const validos = await corretoresDoTenant(ctx.db, ctx.membro.tenantId, [corretorId, captadorId])
  if (!validos.has(corretorId) || !validos.has(captadorId)) throw invalido('Corretor inválido.')

  const quando = agora((deps.agora ?? (() => new Date()))())
  const pct = await deps.comissaoPadrao(ctx.db, ctx.membro.tenantId)
  const ator = { nome: ctx.membro.nome }

  // O número vem de `proximoId` (domínio) sobre os ids já usados. Duas aberturas
  // simultâneas calculam o mesmo número: a PK recusa a segunda e ela tenta de novo.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const ids = await idsDoAno(ctx.db, ctx.membro.tenantId, new Date().getFullYear())
    const estado: Estado = { processos: ids.map((id) => ({ id }) as Processo), documentos: [], locacoes: [] }
    const r = abrirProcesso(
      estado,
      { imovel: dados.imovel, vendedor: dados.vendedor, comprador: dados.comprador, corretorId, captadorId, pct },
      ator,
      quando,
    )
    if (!r.ok) throw invalido(r.erro)
    const novo = r.estado.processos[0]!
    const res = await inserirVenda(ctx.db, ctx.membro.tenantId, novo)
    if (res === 'ok') {
      await evento(ctx, deps, 'venda.abrir', novo.id)
      return resposta({ id: novo.id, versao: 1, processo: novo }, c.valores)
    }
  }
  throw createError({ statusCode: 409, statusMessage: 'Não foi possível numerar o processo agora. Tente de novo.' })
}

export async function executarAcaoVenda(
  ctx: CtxVendas,
  id: string,
  corpo: unknown,
  deps: DepsVendas,
): Promise<VendaResposta> {
  if (!ID_VENDA.test(id)) throw naoEncontrado()
  const nome = (corpo as { acao?: unknown } | null)?.acao
  if (!nomeAcaoValido(nome)) throw createError({ statusCode: 400, statusMessage: 'Ação desconhecida.' })
  const def = ACOES_VENDA[nome]
  const dadosParsed = def.schema.safeParse((corpo as { dados?: unknown }).dados ?? {})
  if (!dadosParsed.success) throw createError({ statusCode: 400, statusMessage: 'Dados inválidos.' })
  // `never` no contrato de `DefinicaoAcao`: o Zod acima é o que garante o formato.
  const dados = dadosParsed.data as never

  const tenantId = ctx.membro.tenantId
  const escopo = escopoDe(ctx)
  const veTodos = escopo.corretorId === undefined
  const quando = agora((deps.agora ?? (() => new Date()))())
  const documentos = deps.documentosDoProcesso ? await deps.documentosDoProcesso(ctx.db, tenantId, id) : []

  // Reatribuição de corretor/captador: valida no tenant e, para quem não vê
  // todos, trava o corretor no atual (a tela faz `corretorTravado`).
  let payload = dados as Record<string, unknown>
  if (nome === 'salvarAbertura') {
    const d = dados as { corretorId: string; captadorId: string }
    const validos = await corretoresDoTenant(ctx.db, tenantId, [d.corretorId, d.captadorId])
    if (!validos.has(d.corretorId) || !validos.has(d.captadorId)) throw invalido('Corretor inválido.')
    if (!veTodos) payload = { ...payload, corretorId: ctx.membro.brokerId }
  }

  const novo = await executarAcao<Venda>({
    carregar: async () => {
      const v = await buscarVenda(ctx.db, escopo, id)
      if (!v) return null
      // A permissão depende do processo (`editar = proprio`), então só dá para
      // checar depois de carregar — e o carregar já escopou, então 403 só
      // aparece para processo que o membro PODE ver.
      const c = capacidades(ctx.matriz, ctx.sessao, v.processo)
      if (!def.permitido(c, payload as never)) throw proibido()
      return v
    },
    paraEstado: (v) => ({ processos: [v.processo], documentos, locacoes: [] }),
    doEstado: (e, antes) => ({ ...antes, processo: e.processos.find((p) => p.id === antes.id) ?? antes.processo }),
    gravar: (n, anterior) => gravarVenda(ctx.db, tenantId, n, anterior),
    acao: amarrar(def.fn(id, payload as never), { nome: ctx.membro.nome }, quando),
  })

  await evento(ctx, deps, `venda.${nome}`, id)
  return resposta(novo, capacidades(ctx.matriz, ctx.sessao).valores)
}
