import { z } from 'zod'
import { abrirLocacao } from '~~/layers/gestao/domain/acoes-locacao'
import { agora, type Estado } from '~~/layers/gestao/domain/acoes'
import { avisosLocacao, hojeISO, type AvisoLocacao } from '~~/layers/gestao/domain/avisos-locacao'
import type { Documento, Locacao } from '~~/layers/gestao/domain/types'
import { ehUuid, paraPerfil, type LocacaoSemValores, type LocacaoVersionada } from '~~/server/mappers/gestao-locacao'
import {
  buscarLocacao,
  corretorDoTenant,
  documentosDaLocacao,
  gravarLocacao,
  imovelDoTenant,
  inserirLocacao,
  listarLocacoes,
  ultimoIdDoAno,
} from '~~/server/repositories/gestao-locacao.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'
import { ACOES_LOCACAO, corpoAcaoSchema, permitidoNaLocacao } from '~~/server/utils/gestao-locacao-acoes'
import { executarAcao } from '~~/server/utils/gestao-acoes'
import { exigirPermissao, type ContextoGestao } from '~~/server/utils/gestao-auth'
import { agoraBrasil } from '~~/server/utils/gestao-tempo'

/**
 * Casos de uso de locação do gestão: o que os endpoints de `server/api/gestao/locacoes*`
 * chamam. Os endpoints ficam finos (ler corpo, devolver resposta) e a regra — escopo
 * do corretor, 404 sem vazar existência, 409 de versão, recorte de valores — mora
 * aqui, onde dá para testar sem subir o Nitro.
 *
 * `tenant_id` sai SEMPRE de `ctx.membro.tenantId` (CLAUDE.md, invariante 1): nenhum
 * caso de uso aceita tenant, perfil ou corretor vindos do corpo.
 */

const MSG_VERSAO = 'Esta locação foi alterada por outra pessoa. Recarregue.'
const ID = /^L-\d{4}-\d{4,}$/

/**
 * O id da locação é o código `L-AAAA-NNNN` do domínio, não um uuid: não passa por
 * `idDeRota` (validate.ts). Mesmo contrato dele — 400 para id malformado, para o
 * texto nunca chegar ao banco sem forma conferida (varredura em `id-de-rota.test.ts`).
 */
export function idDeLocacao(valor: string | null | undefined): string {
  const id = (valor || '').trim()
  if (!ID.test(id)) throw createError({ statusCode: 400, statusMessage: 'ID da locação inválido.' })
  return id
}

export interface RespostaLocacao {
  locacao: Locacao | LocacaoSemValores
  /** número a devolver em `versao` na próxima ação */
  versao: number
  avisos: AvisoLocacao[]
}

const naoEncontrada = () => createError({ statusCode: 404, statusMessage: 'Locação não encontrada.' })

const verValores = (ctx: ContextoGestao) => ctx.matriz.valores?.[ctx.membro.perfil] === 'sim'

/**
 * Corretor com `verTodos = proprio` só enxerga as suas. Devolve `undefined` (sem
 * filtro) só para quem vê todas; `null` = corretor sem vínculo, que não vê nenhuma.
 */
function escopo(ctx: ContextoGestao): { corretorId?: string | null } {
  return ctx.matriz.verTodos?.[ctx.membro.perfil] === 'sim' ? {} : { corretorId: ctx.membro.brokerId }
}

/** Arquivadas são da tela «Arquivados», que o menu mostra a quem arquiva ou apaga documento. */
function veArquivadas(ctx: ContextoGestao): boolean {
  const m = ctx.matriz
  const p = ctx.membro.perfil
  return m.arquivar?.[p] === 'sim' || m.apagarDocs?.[p] === 'sim'
}

function resposta(ctx: ContextoGestao, { locacao, versao }: LocacaoVersionada): RespostaLocacao {
  // «Hoje» é o do servidor em Brasília: o cliente não escolhe a data dos avisos.
  const avisos = avisosLocacao(locacao, hojeISO(agoraBrasil()))
  return { locacao: paraPerfil(locacao, verValores(ctx)), versao, avisos }
}

export async function listar(ctx: ContextoGestao, arquivadas: boolean): Promise<RespostaLocacao[]> {
  if (arquivadas && !veArquivadas(ctx)) throw createError({ statusCode: 403, statusMessage: 'Sem permissão para ver os arquivados.' })
  const itens = await listarLocacoes(ctx.db, ctx.membro.tenantId, { arquivadas, ...escopo(ctx) })
  return itens.map((i) => resposta(ctx, i))
}

export async function ler(ctx: ContextoGestao, id: string): Promise<RespostaLocacao> {
  if (!ID.test(id)) throw naoEncontrada()
  const item = await buscarLocacao(ctx.db, ctx.membro.tenantId, id, escopo(ctx))
  // Arquivada some para quem não vê arquivados, igual à lista: ainda é 404, não 403.
  if (!item || (item.locacao.arquivado && !veArquivadas(ctx))) throw naoEncontrada()
  return resposta(ctx, item)
}

const aberturaSchema = z.object({
  locador: z.string().max(200),
  locatario: z.string().max(200),
  imovelId: z.string().max(80),
  imovel: z.string().max(300),
  /** Ignorado para corretor: ele só abre locação em seu nome. */
  corretorId: z.string().max(80).optional(),
})

function corpoInvalido(erro: z.ZodError): never {
  throw createError({ statusCode: 422, statusMessage: erro.issues[0]?.message ?? 'Dados inválidos.' })
}

const MAX_TENTATIVAS_NUMERO = 3

export async function abrir(ctx: ContextoGestao, corpo: unknown): Promise<RespostaLocacao> {
  exigirPermissao(ctx, 'criar')
  const parsed = aberturaSchema.safeParse(corpo)
  if (!parsed.success) corpoInvalido(parsed.error)
  const d = parsed.data
  const tenantId = ctx.membro.tenantId

  let corretorId: string
  if (ctx.membro.perfil === 'corretor') {
    if (!ctx.membro.brokerId) throw createError({ statusCode: 403, statusMessage: 'Seu usuário não está ligado a um corretor.' })
    corretorId = ctx.membro.brokerId
  } else {
    if (!d.corretorId || !ehUuid(d.corretorId) || !(await corretorDoTenant(ctx.db, tenantId, d.corretorId))) {
      throw createError({ statusCode: 422, statusMessage: 'Escolha um corretor desta imobiliária.' })
    }
    corretorId = d.corretorId
  }
  if (!ehUuid(d.imovelId) || !(await imovelDoTenant(ctx.db, tenantId, d.imovelId))) {
    throw createError({ statusCode: 422, statusMessage: 'Escolha um imóvel desta imobiliária.' })
  }

  const hora = agoraBrasil()
  const ator = { nome: ctx.membro.nome }
  const ano = new Date().getFullYear() // o mesmo ano que `proximoIdLocacao` usa por padrão
  for (let i = 0; i < MAX_TENTATIVAS_NUMERO; i++) {
    const ultimo = await ultimoIdDoAno(ctx.db, tenantId, ano)
    // `proximoIdLocacao` olha só os ids: um esqueleto com o último basta para numerar.
    const estado: Estado = { processos: [], documentos: [], locacoes: ultimo ? [{ id: ultimo } as Locacao] : [] }
    const r = abrirLocacao(estado, { locador: d.locador, locatario: d.locatario, imovelId: d.imovelId, imovel: d.imovel, corretorId }, ator, agora(hora))
    if (!r.ok) throw createError({ statusCode: 422, statusMessage: r.erro })
    const nova = r.estado.locacoes[0]!
    if ((await inserirLocacao(ctx.db, tenantId, nova)) === 'ok') {
      await auditar(ctx, 'abrirLocacao', nova.id)
      return resposta(ctx, { locacao: nova, versao: 1 })
    }
  }
  throw createError({ statusCode: 409, statusMessage: 'Outra locação foi aberta ao mesmo tempo. Tente de novo.' })
}

/**
 * `gestao_eventos` é append-only e a auditoria da tela lê `hist`: se o evento falhar
 * DEPOIS de a locação já estar gravada, devolver 500 faria o cliente repetir uma ação
 * que já valeu (e tomar 409). Registra o erro e segue; o `hist` do agregado guarda a ação.
 */
async function auditar(ctx: ContextoGestao, acao: string, alvoId: string): Promise<void> {
  try {
    await registrarEvento(ctx.db, ctx.membro.tenantId, {
      atorUserId: ctx.membro.userId,
      atorNome: ctx.membro.nome,
      acao,
      alvoTipo: 'locacao',
      alvoId,
    })
  } catch (e) {
    logError('gestao.locacao.evento', { acao, alvoId, erro: errMessage(e) })
  }
}

/** Mesmo agregado que `executarAcao` carrega, grava e devolve: a locação mais o que a regra lê. */
interface Agregado {
  id: string
  versao: number
  locacao: Locacao
  documentos: Documento[]
}

export async function agir(ctx: ContextoGestao, id: string, corpo: unknown): Promise<RespostaLocacao> {
  if (!ID.test(id)) throw naoEncontrada()
  const c = corpoAcaoSchema.safeParse(corpo)
  if (!c.success) corpoInvalido(c.error)
  const def = ACOES_LOCACAO[c.data.acao]
  // `in` olharia o protótipo: `__proto__`/`constructor` viriam como ação.
  if (!def || !Object.hasOwn(ACOES_LOCACAO, c.data.acao)) throw createError({ statusCode: 422, statusMessage: 'Ação desconhecida.' })
  const d = def.schema.safeParse(c.data.dados ?? {})
  if (!d.success) corpoInvalido(d.error)
  let dados: unknown = d.data

  // 403 só pela matriz, antes de tocar no banco: não depende de a locação existir,
  // então não revela nada. O `proprio` (precisa da locação) é conferido ao carregar.
  const chaves = def.permissao(dados)
  const { matriz, membro } = ctx
  if (!chaves.some((k) => (matriz[k]?.[membro.perfil] ?? 'nao') !== 'nao')) {
    throw createError({ statusCode: 403, statusMessage: 'Você não tem permissão para esta ação.' })
  }

  const tenantId = membro.tenantId
  let versaoLida = 0

  const novo = await executarAcao<Agregado>({
    carregar: async () => {
      const item = await buscarLocacao(ctx.db, tenantId, id, escopo(ctx))
      if (!item || (item.locacao.arquivado && !veArquivadas(ctx))) return null
      if (item.versao !== c.data.versao) throw createError({ statusCode: 409, statusMessage: MSG_VERSAO })
      if (!permitidoNaLocacao(matriz, membro.perfil, membro.brokerId, chaves, item.locacao)) {
        throw createError({ statusCode: 403, statusMessage: 'Você não tem permissão para esta ação.' })
      }
      if (def.tocaVinculos) dados = await validarVinculos(ctx, dados as Vinculos, item.locacao)
      versaoLida = item.versao
      // Os documentos só pesam em «concluir etapa» (checklist): nas outras ações a leitura seria à toa.
      const documentos = c.data.acao === 'concluirEtapaLocacao' ? await documentosDaLocacao(ctx.db, tenantId, id) : []
      return { id, versao: item.versao, locacao: item.locacao, documentos }
    },
    paraEstado: (a) => ({ processos: [], documentos: a.documentos, locacoes: [a.locacao] }),
    doEstado: (e, antes) => ({ ...antes, locacao: e.locacoes.find((l) => l.id === antes.id)! }),
    gravar: (n, versaoAnterior) => gravarLocacao(ctx.db, tenantId, n.locacao, versaoAnterior),
    acao: (estado, ator, quando) => def.fn(estado, id, dados, ator, quando),
  })

  await auditar(ctx, c.data.acao, id)
  // O agregado devolvido é o estado novo; a versão gravada é a lida + 1 (é o que o `update` escreve).
  return resposta(ctx, { locacao: novo.locacao, versao: versaoLida + 1 })
}

interface Vinculos {
  corretorId: string
  imovelId: string
}

/**
 * `corretorId` e `imovelId` vêm do corpo e viram vínculo com outras tabelas: sem
 * esta checagem, um usuário aponta a locação para o corretor ou o imóvel de OUTRA
 * imobiliária (invariante 1). Só confere o que mudou, para não reprovar uma locação
 * antiga cujo imóvel já saiu do catálogo. Corretor não reatribui: o campo é travado
 * na tela (`corretor-travado`) e aqui o servidor faz valer.
 */
async function validarVinculos(ctx: ContextoGestao, d: Vinculos, atual: Locacao): Promise<Vinculos> {
  const tenantId = ctx.membro.tenantId
  const out = { ...d }
  if (ctx.membro.perfil === 'corretor') out.corretorId = atual.corretorId
  else if (d.corretorId !== atual.corretorId && !(ehUuid(d.corretorId) && (await corretorDoTenant(ctx.db, tenantId, d.corretorId)))) {
    throw createError({ statusCode: 422, statusMessage: 'Escolha um corretor desta imobiliária.' })
  }
  if (d.imovelId !== atual.imovelId && !(ehUuid(d.imovelId) && (await imovelDoTenant(ctx.db, tenantId, d.imovelId)))) {
    throw createError({ statusCode: 422, statusMessage: 'Escolha um imóvel desta imobiliária.' })
  }
  return out
}
