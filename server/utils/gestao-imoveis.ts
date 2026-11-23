import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { PropertyStatus } from '~~/shared/models/property'
import type { ImovelGestao } from '~~/layers/gestao/domain/imoveis'
import { STATUS_IMOVEL, rotuloImovel, semAcento, situacaoPorContratos, type SituacaoImovel } from '~~/layers/gestao/domain/imoveis'
import { filtroPedeVarredura, paginaDeImoveis, type FiltroListaImoveis, type PaginaImoveis } from '~~/layers/gestao/domain/imoveis-lista'
import { POR_PAGINA, totalDePaginas } from '~~/layers/gestao/domain/paginacao'
import { permissoesImovel, podeExcluirImovel, validarImovel } from '~~/layers/gestao/domain/imoveis-acoes'
import { definirCapa, moverFoto, removerFoto } from '~~/layers/gestao/domain/imoveis-fotos'
import type { Locacao, MatrizPermissoes, Perfil, Sessao } from '~~/layers/gestao/domain/types'
import { lerCorpoImovel, toImovelGestao, toPropertyInput } from '~~/server/mappers/gestao-imovel'
import { getBroker } from '~~/server/repositories/broker.repository'
import { contratosAtivosDosImoveis } from '~~/server/repositories/gestao-imovel-situacao.repository'
import {
  createProperty,
  deleteProperty,
  deletePropertyImage,
  getPropertyById,
  insertPropertyImages,
  listAllProperties,
  listPropertiesPage,
  listPropertyIdentities,
  updatePropertyFeatured,
  updatePropertyImageOrder,
  updatePropertySemImagens,
  updatePropertyStatus,
} from '~~/server/repositories/property.repository'
import { FOTOS_IMOVEL_MAX_SERVIDOR, prepararFotos, type FotoArmazenada, type FotoPronta } from '~~/server/utils/gestao-fotos'

/**
 * Núcleo do cadastro de imóveis do painel de gestão (`/api/gestao/imoveis/**`).
 *
 * Imóvel é espelho do catálogo: grava em `properties`/`property_images`, as mesmas
 * tabelas do `/admin`, pelo `property.repository`. Esta camada acrescenta o que o
 * `/admin` não tem — o escopo do corretor — e traduz o modelo (`ImovelGestao`).
 *
 * Tudo roda por `serviceSupabase()` (BYPASSRLS): o `tenant.id` do contexto vai em
 * toda query e NUNCA vem do corpo. O contexto é recebido por parâmetro, com as
 * quatro dependências de borda injetadas (`registrar`, `invalidarCache`,
 * `armazenarFoto`, `locacoesDoImovel`), para o núcleo não importar nada da F1 e
 * os testes não precisarem de `vi.mock` de módulo.
 *
 * Fora do escopo do corretor é **404**, não 403: 403 confirmaria que o id existe.
 */

export interface ContextoImoveis {
  membro: { userId: string; nome: string; perfil: Perfil; brokerId: string | null }
  tenant: { id: string; slug: string }
  matriz: MatrizPermissoes
  db: SupabaseClient<Database>
  registrar: (acao: string, alvoId: string) => Promise<void>
  /** Limpa o cache do catálogo público: o gestão publica no site, como o `/admin`. */
  invalidarCache: () => Promise<void>
  armazenarFoto: (foto: FotoPronta) => Promise<FotoArmazenada>
  locacoesDoImovel: (imovelId: string) => Promise<Locacao[]>
}

export const LIMITE_LISTA_IMOVEIS = 200

const erro = (statusCode: number, statusMessage: string) => createError({ statusCode, statusMessage })
const naoEncontrado = () => erro(404, 'Imóvel não encontrado.')

const sessaoDe = (ctx: ContextoImoveis): Sessao => ({
  perfil: ctx.membro.perfil,
  nome: ctx.membro.nome,
  // `|| null`: vínculo vazio ('') não pode casar com o `brokerId: ''` de imóvel antigo sem corretor
  corretorId: ctx.membro.brokerId || null })

/**
 * Imóvel DESTE tenant (o tenant sai da sessão, nunca do corpo); senão 404. É a porta de TODA operação por id:
 * a conferência de escopo mora aqui, e não em cada função, para não existir caminho que a esqueça.
 */
async function carregarVisivel(ctx: ContextoImoveis, id: string) {
  const p = await getPropertyById(ctx.db, ctx.tenant.id, id)
  if (!p) throw naoEncontrado()
  const imovel = toImovelGestao(p)
  return { imovel, perm: permissoesImovel(ctx.matriz, sessaoDe(ctx)) }
}

async function recarregar(ctx: ContextoImoveis, id: string): Promise<ImovelGestao> {
  const p = await getPropertyById(ctx.db, ctx.tenant.id, id)
  if (!p) throw naoEncontrado()
  return toImovelGestao(p)
}

/** Todos os imóveis do tenant, para qualquer perfil: o corretor abre contrato e edita o que quiser. O limite protege a resposta, não o escopo. */
export async function listarImoveis(ctx: ContextoImoveis): Promise<ImovelGestao[]> {
  const props = await listAllProperties(ctx.db, ctx.tenant.id, { limite: LIMITE_LISTA_IMOVEIS, recentes: true })
  return props.map(toImovelGestao)
}

/** Teto da varredura de imóveis (busca por texto e filtro por situação): o PostgREST corta uma resposta em 1000 linhas. */
export const LIMITE_VARREDURA_IMOVEIS = 1000

/**
 * Uma página da lista de imóveis, com o filtro INTEIRO decidido aqui (nada de filtrar no cliente o que o
 * servidor cortou). Qualquer perfil vê o tenant todo; o tenant sai da sessão, nunca da query.
 *
 * - Sem texto e sem situação: o banco filtra `status`/`purpose`, conta e fatia (`range`): uma página por consulta.
 * - Com texto ou situação: lê os imóveis do tenant (até `LIMITE_VARREDURA_IMOVEIS`) e filtra com as MESMAS
 *   funções do mock. Alternativa descartada para o texto: `ilike` no banco, que acha «Jose» mas não «José»
 *   (a busca da tela sempre ignorou acento); a situação nem existe como coluna, vem dos contratos.
 *
 * A situação de cada imóvel é calculada dos contratos ativos DO TENANT (duas colunas por linha), não do que o
 * corretor logado carrega: o imóvel em locação de outro corretor não pode aparecer como disponível.
 */
export async function listarImoveisPagina(ctx: ContextoImoveis, f: FiltroListaImoveis): Promise<PaginaImoveis> {
  const contratos = await contratosAtivosDosImoveis(ctx.db, ctx.tenant.id)
  const situacaoDe = (id: string): SituacaoImovel => situacaoPorContratos(contratos.emLocacao.has(id), contratos.vendas.get(id) ?? [])

  if (filtroPedeVarredura(f)) {
    const props = await listAllProperties(ctx.db, ctx.tenant.id, { limite: LIMITE_VARREDURA_IMOVEIS, recentes: true })
    return { ...paginaDeImoveis(props.map(toImovelGestao), situacaoDe, f), truncado: props.length >= LIMITE_VARREDURA_IMOVEIS || contratos.truncado }
  }
  const { properties, total } = await listPropertiesPage(ctx.db, ctx.tenant.id, { status: f.status, purpose: f.purpose }, f.pagina, POR_PAGINA)
  const itens = properties.map(toImovelGestao).map((i) => ({ ...i, situacao: situacaoDe(i.id) }))
  return { itens, total, pagina: f.pagina, porPagina: POR_PAGINA, paginas: totalDePaginas(total), truncado: contratos.truncado }
}

export async function obterImovel(ctx: ContextoImoveis, id: string): Promise<ImovelGestao> {
  return (await carregarVisivel(ctx, id)).imovel
}

/** Maior sufixo numérico de todos os códigos do tenant + 1. Colisão de corrida vira 23505 e é tratada na criação. */
export function proximoCodigo(codigos: string[], pulo = 0): string {
  const maior = codigos.reduce((m, c) => Math.max(m, Number(/(\d+)\s*$/.exec(c)?.[1] ?? 0)), 0)
  return `IM-${String(maior + 1 + pulo).padStart(4, '0')}`
}

/** O rótulo vira o texto do contrato: dois imóveis com o mesmo se confundem nas listas (mesma regra do domínio). */
function jaExiste(identidades: { id: string; title: string; location: string | null }[], alvo: Pick<ImovelGestao, 'title' | 'location'>, ignorarId: string | null): boolean {
  const r = semAcento(rotuloImovel(alvo))
  return identidades.some((i) => i.id !== ignorarId && semAcento(rotuloImovel(i)) === r)
}

/** O corretor vendedor tem de ser do tenant: `broker_id` de outra imobiliária quebraria o isolamento pela FK. */
async function assertCorretorDoTenant(ctx: ContextoImoveis, brokerId: string): Promise<void> {
  const b = await getBroker(ctx.db, ctx.tenant.id, brokerId)
  if (!b) throw erro(422, 'Corretor não encontrado.')
  if (!b.active) throw erro(422, 'Este corretor está inativo. Escolha outro corretor vendedor.')
}

export async function criarImovel(ctx: ContextoImoveis, corpo: unknown): Promise<ImovelGestao> {
  const sessao = sessaoDe(ctx)
  const perm = permissoesImovel(ctx.matriz, sessao)
  if (!perm.criar) throw erro(403, 'Você não pode cadastrar imóveis.')
  const lido = lerCorpoImovel(corpo)
  if (!lido.ok) throw erro(422, lido.erro)

  // Quem não troca corretor cadastra como vendedor ele mesmo; o `brokerId` do corpo é ignorado.
  if (!perm.trocarCorretor) {
    if (!ctx.membro.brokerId) throw erro(403, 'Seu usuário não está vinculado a um corretor.')
    lido.dados.brokerId = ctx.membro.brokerId
  }
  const v = validarImovel(lido.dados)
  if (!v.ok) throw erro(422, v.erro)
  await assertCorretorDoTenant(ctx, v.dados.brokerId)

  const identidades = await listPropertyIdentities(ctx.db, ctx.tenant.id)
  if (jaExiste(identidades, v.dados, null)) throw erro(409, 'Já existe um imóvel com este título e endereço.')

  const codigos = identidades.map((i) => i.code)
  let criado
  try {
    criado = await createProperty(ctx.db, ctx.tenant.id, toPropertyInput(v.dados, proximoCodigo(codigos)), ctx.membro.userId)
  } catch (e) {
    // Dois cadastros ao mesmo tempo leem o mesmo «maior código»: um deles bate na unicidade. Uma
    // nova tentativa pula o número ocupado; erro que não é de código repetido sobe como está.
    if ((e as { statusCode?: number }).statusCode !== 409) throw e
    criado = await createProperty(ctx.db, ctx.tenant.id, toPropertyInput(v.dados, proximoCodigo(codigos, 1)), ctx.membro.userId)
  }
  await ctx.invalidarCache()
  await ctx.registrar('imovel.criar', criado.id)
  return toImovelGestao(criado)
}

export async function atualizarImovel(ctx: ContextoImoveis, id: string, corpo: unknown): Promise<ImovelGestao> {
  const { imovel, perm } = await carregarVisivel(ctx, id)
  if (!perm.editar) throw erro(403, 'Você não pode editar este imóvel.')
  const lido = lerCorpoImovel(corpo)
  if (!lido.ok) throw erro(422, lido.erro)

  // Trocar o vendedor é de dono, jurídico e recepção. Para o corretor o valor do corpo é descartado.
  if (!perm.trocarCorretor) lido.dados.brokerId = imovel.brokerId
  const v = validarImovel(lido.dados)
  if (!v.ok) throw erro(422, v.erro)
  if (v.dados.brokerId !== imovel.brokerId) await assertCorretorDoTenant(ctx, v.dados.brokerId)

  const identidades = await listPropertyIdentities(ctx.db, ctx.tenant.id)
  if (jaExiste(identidades, v.dados, id)) throw erro(409, 'Já existe um imóvel com este título e endereço.')

  const atualizado = await updatePropertySemImagens(
    ctx.db,
    ctx.tenant.id,
    id,
    toPropertyInput(v.dados, imovel.code!),
    lido.expectedUpdatedAt,
    ctx.membro.userId,
  )
  await ctx.invalidarCache()
  await ctx.registrar('imovel.editar', id)
  return toImovelGestao(atualizado)
}

export async function mudarStatus(ctx: ContextoImoveis, id: string, status: unknown): Promise<ImovelGestao> {
  if (typeof status !== 'string' || !STATUS_IMOVEL.includes(status as PropertyStatus)) throw erro(422, 'Status inválido.')
  const { perm } = await carregarVisivel(ctx, id)
  if (!perm.editar) throw erro(403, 'Você não pode editar este imóvel.')
  const atualizado = await updatePropertyStatus(ctx.db, ctx.tenant.id, id, status as PropertyStatus, ctx.membro.userId)
  await ctx.invalidarCache()
  await ctx.registrar('imovel.status', id)
  return toImovelGestao(atualizado)
}

export async function definirDestaqueImovel(ctx: ContextoImoveis, id: string, featured: unknown): Promise<ImovelGestao> {
  if (typeof featured !== 'boolean') throw erro(422, 'featured deve ser booleano.')
  const { perm } = await carregarVisivel(ctx, id)
  if (!perm.editar) throw erro(403, 'Você não pode editar este imóvel.')
  const atualizado = await updatePropertyFeatured(ctx.db, ctx.tenant.id, id, featured)
  await ctx.invalidarCache()
  await ctx.registrar('imovel.destaque', id)
  return toImovelGestao(atualizado)
}

export async function excluirImovel(ctx: ContextoImoveis, id: string): Promise<{ ok: true }> {
  const { imovel, perm } = await carregarVisivel(ctx, id)
  if (!perm.excluir) throw erro(403, 'Você não pode excluir este imóvel.')
  const locacoes = await ctx.locacoesDoImovel(id)
  const pode = podeExcluirImovel(imovel, sessaoDe(ctx), ctx.matriz, locacoes)
  if (!pode.ok) throw erro(409, pode.erro)
  try {
    await deleteProperty(ctx.db, ctx.tenant.id, id)
  } catch (e) {
    // 23503 = outra tabela ainda aponta para o imóvel (contrato, por exemplo). Sem a tradução subiria como 500.
    if ((e as { code?: string })?.code === '23503') {
      throw erro(409, 'Este imóvel está vinculado a contratos ou outros registros. Mude o status para rascunho em vez de excluir.')
    }
    throw e
  }
  await ctx.invalidarCache()
  await ctx.registrar('imovel.excluir', id)
  return { ok: true }
}

// --- fotos --------------------------------------------------------------------------------------

export async function adicionarFotosImovel(ctx: ContextoImoveis, id: string, corpo: unknown): Promise<ImovelGestao> {
  const { imovel, perm } = await carregarVisivel(ctx, id)
  if (!perm.editar) throw erro(403, 'Você não pode editar este imóvel.')
  const pronto = prepararFotos((corpo as { fotos?: unknown } | null)?.fotos)
  if (!pronto.ok) throw erro(422, pronto.erro)
  if (imovel.images.length + pronto.fotos.length > FOTOS_IMOVEL_MAX_SERVIDOR) {
    throw erro(422, `Cada imóvel aceita no máximo ${FOTOS_IMOVEL_MAX_SERVIDOR} fotos.`)
  }

  const novas: { url: string; urlSm: string | null; alt: string | null; position: number; isCover: boolean }[] = []
  for (const foto of pronto.fotos) {
    const { url, urlSm } = await ctx.armazenarFoto(foto)
    const posicao = imovel.images.length + novas.length
    novas.push({ url, urlSm, alt: foto.alt, position: posicao, isCover: posicao === 0 })
  }
  await insertPropertyImages(ctx.db, ctx.tenant.id, id, novas)
  await ctx.invalidarCache()
  await ctx.registrar('imovel.fotos', id)
  return recarregar(ctx, id)
}

/** Vale para capa, ordem e remoção: a foto precisa ser DESTE imóvel, senão 404 (o id vem da URL). */
async function carregarParaFoto(ctx: ContextoImoveis, id: string, fotoId: string) {
  const { imovel, perm } = await carregarVisivel(ctx, id)
  if (!perm.editar) throw erro(403, 'Você não pode editar este imóvel.')
  if (!imovel.images.some((f) => f.id === fotoId)) throw erro(404, 'Foto não encontrada.')
  return imovel
}

const ordem = (fotos: ImovelGestao['images']) => fotos.map((f) => ({ id: f.id, position: f.position, isCover: f.isCover }))

export async function definirCapaImovel(ctx: ContextoImoveis, id: string, fotoId: string): Promise<ImovelGestao> {
  const imovel = await carregarParaFoto(ctx, id, fotoId)
  await updatePropertyImageOrder(ctx.db, ctx.tenant.id, id, ordem(definirCapa(imovel.images, fotoId)))
  await ctx.invalidarCache()
  await ctx.registrar('imovel.fotos', id)
  return recarregar(ctx, id)
}

export async function moverFotoImovel(ctx: ContextoImoveis, id: string, fotoId: string, direcao: unknown): Promise<ImovelGestao> {
  if (direcao !== 'cima' && direcao !== 'baixo') throw erro(422, 'Direção inválida.')
  const imovel = await carregarParaFoto(ctx, id, fotoId)
  await updatePropertyImageOrder(ctx.db, ctx.tenant.id, id, ordem(moverFoto(imovel.images, fotoId, direcao)))
  await ctx.invalidarCache()
  await ctx.registrar('imovel.fotos', id)
  return recarregar(ctx, id)
}

export async function removerFotoImovel(ctx: ContextoImoveis, id: string, fotoId: string): Promise<ImovelGestao> {
  const imovel = await carregarParaFoto(ctx, id, fotoId)
  await deletePropertyImage(ctx.db, ctx.tenant.id, id, fotoId)
  await updatePropertyImageOrder(ctx.db, ctx.tenant.id, id, ordem(removerFoto(imovel.images, fotoId)))
  await ctx.invalidarCache()
  await ctx.registrar('imovel.fotos', id)
  return recarregar(ctx, id)
}
