import { apagarDocumento, conferirDocumento, restaurarDocumento, type Estado } from '~~/layers/gestao/domain/acoes'
import { requisitoPorChave } from '~~/layers/gestao/domain/requisitos'
import { ROTULO_CATEGORIA } from '~~/layers/gestao/domain/documentos'
import type { CategoriaDocumento } from '~~/layers/gestao/domain/types'
import type { DocumentoGestao } from '~~/server/mappers/gestao-documento'
import {
  confirmarVersao,
  criarDocumentoPendente,
  descartarPendente,
  enviarParaLixeira,
  listarDocumentosDoAlvo,
  listarLixeira,
  marcarConferido,
  obterDocumento,
  restaurarDaLixeira,
  type DocumentoComCaminho,
} from '~~/server/repositories/gestao-documento.repository'
import { marcarPdfSeContrato } from '~~/server/utils/gestao-venda-pdf'
import { ehUuid } from '~~/shared/utils/uuid'
import { carregarAlvoVisivel, idsAlvosVisiveis, type CtxAlvo } from '~~/server/utils/gestao-alvo'
import {
  BUCKET_GESTAO_DOCS,
  VALIDADE_DOWNLOAD_SEGUNDOS,
  caminhoDoDocumento,
  caminhoPertenceAoTenant,
  inspecionarBytes,
  lerAlvo,
  validarEnvio,
} from '~~/server/utils/gestao-documento-regras'

/**
 * Orquestração dos documentos do /gestao. Os endpoints são finos: autenticam
 * (F1), checam a permissão da ação e chamam estas funções, que aplicam o resto —
 * visibilidade do alvo, lixeira, caminho do Storage, formato do arquivo.
 *
 * Não checam PERMISSÃO (`enviarDocs`, `conferir`, `apagarDocs`): é do endpoint,
 * por `exigirPermissao`, antes de chegar aqui. Visibilidade (corretor só vê o
 * que é seu) é daqui, porque depende do documento carregado.
 */

export interface CtxDocs extends CtxAlvo {
  membro: CtxAlvo['membro'] & { nome: string }
}

const naoEncontrado = () => createError({ statusCode: 404, statusMessage: 'Não encontrado.' })
const recusa = (statusMessage: string, statusCode = 422) => createError({ statusCode, statusMessage })

/** Mesma frase do 409 de venda/locação (F2/F4): a tela trata os dois igual. */
const CONFLITO = 'Este documento foi alterado por outra pessoa. Recarregue.'

/**
 * Documento por id, SÓ se o processo/locação dele é visível a quem pergunta.
 * Id inválido, inexistente, de outro tenant ou de processo alheio: o mesmo 404.
 */
async function carregarVisivel(ctx: CtxDocs, id: string): Promise<DocumentoComCaminho> {
  if (!ehUuid(id)) throw naoEncontrado()
  const achado = await obterDocumento(ctx.db, ctx.membro.tenantId, id)
  if (!achado) throw naoEncontrado()
  await carregarAlvoVisivel(ctx, achado.doc.alvoTipo, achado.doc.processoId)
  return achado
}

/** Documento que ainda não foi confirmado não existe para conferir, baixar, apagar ou restaurar. */
async function carregarConfirmado(ctx: CtxDocs, id: string): Promise<DocumentoComCaminho> {
  const achado = await carregarVisivel(ctx, id)
  if (achado.doc.estado === 'pendente') throw naoEncontrado()
  return achado
}

const estadoDe = (doc: DocumentoGestao): Estado => ({ processos: [], documentos: [doc], locacoes: [] })

export async function listarDocumentos(ctx: CtxDocs, alvoParam: unknown): Promise<DocumentoGestao[]> {
  const alvo = lerAlvo(alvoParam)
  if (!alvo) throw recusa('Informe o processo: ?alvo=venda:<id> ou locacao:<id>.')
  await carregarAlvoVisivel(ctx, alvo.tipo, alvo.id)
  return listarDocumentosDoAlvo(ctx.db, ctx.membro.tenantId, alvo)
}

export async function listarDocumentosApagados(ctx: CtxDocs, alvoParam?: unknown): Promise<DocumentoGestao[]> {
  if (alvoParam !== undefined && alvoParam !== '') {
    const alvo = lerAlvo(alvoParam)
    if (!alvo) throw recusa('Alvo inválido.')
    await carregarAlvoVisivel(ctx, alvo.tipo, alvo.id)
    return listarDocumentosDoAlvo(ctx.db, ctx.membro.tenantId, alvo, { lixeira: true })
  }
  return listarLixeira(ctx.db, ctx.membro.tenantId, await idsAlvosVisiveis(ctx))
}

export interface EnvioIniciado {
  documentoId: string
  uploadUrl: string
  token: string
  /** Versão que o envio vai criar (1 = documento novo). */
  versao: number
}

/**
 * Passo 1 do upload: valida o que foi DECLARADO, decide o caminho e emite a URL
 * assinada. O cliente sobe direto ao Storage (limite de corpo da função da
 * Vercel é 4,5 MB) e depois chama `confirmarEnvio`.
 *
 * `documentoId` presente = nova versão de um documento existente; ausente =
 * documento novo, que nasce `pendente` e invisível nas listas.
 */
export async function iniciarEnvio(ctx: CtxDocs, corpo: unknown): Promise<EnvioIniciado> {
  const b = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const alvo = lerAlvo(b.alvo)
  if (!alvo) throw recusa('Informe o processo do documento.')
  const envio = validarEnvio({ nome: b.nome, tamanho: b.tamanho, mime: b.mime })
  if (!envio.ok) throw recusa(envio.erro)

  await carregarAlvoVisivel(ctx, alvo.tipo, alvo.id)
  const tenantId = ctx.membro.tenantId

  let documentoId: string
  let versao: number
  if (b.documentoId !== undefined && b.documentoId !== null && b.documentoId !== '') {
    const atual = await carregarVisivel(ctx, String(b.documentoId))
    if (atual.doc.alvoTipo !== alvo.tipo || atual.doc.processoId !== alvo.id) throw naoEncontrado()
    if (atual.doc.apagado) throw recusa('Este documento está na lixeira. Restaure antes de enviar nova versão.')
    documentoId = atual.doc.id
    versao = atual.doc.versoes + 1
  } else {
    const req = typeof b.requisito === 'string' && b.requisito ? requisitoPorChave(b.requisito) : undefined
    if (typeof b.requisito === 'string' && b.requisito && !req) throw recusa('Item de checklist desconhecido.')
    // O item manda na categoria (como `enviarDocumento` do domínio).
    const categoria = req?.categoria ?? b.categoria
    if (typeof categoria !== 'string' || !(categoria in ROTULO_CATEGORIA)) throw recusa('Escolha a categoria do documento.')
    documentoId = await criarDocumentoPendente(ctx.db, tenantId, {
      alvoTipo: alvo.tipo,
      alvoId: alvo.id,
      nome: envio.nome,
      categoria: categoria as CategoriaDocumento,
      requisito: req?.chave ?? null,
      // Quem enviou vem da sessão, nunca do corpo.
      enviadoPor: ctx.membro.nome,
    })
    versao = 1
  }

  const caminho = caminhoDoDocumento({ tenantId, alvoTipo: alvo.tipo, alvoId: alvo.id, documentoId, versao })
  // Sem `upsert`: caminho já ocupado é erro, não sobrescrita silenciosa.
  const { data, error } = await ctx.db.storage.from(BUCKET_GESTAO_DOCS).createSignedUploadUrl(caminho)
  if (error || !data) {
    logError('gestao.documento.upload_url', { tenantId, documentoId, motivo: errMessage(error) })
    throw recusa('Não foi possível preparar o envio. Tente de novo.', 502)
  }
  return { documentoId, uploadUrl: data.signedUrl, token: data.token, versao }
}

/**
 * Passo 2: o arquivo chegou? Abre o objeto no caminho que O SERVIDOR calculou
 * (nada do corpo da requisição entra no caminho), confere o formato pelos
 * primeiros bytes e o tamanho real, e só então grava a versão.
 *
 * Recusado, o objeto é apagado do bucket: sem linha apontando para ele,
 * ninguém mais o alcançaria.
 */
export async function confirmarEnvio(ctx: CtxDocs, id: string): Promise<DocumentoGestao> {
  const achado = await carregarVisivel(ctx, id)
  const tenantId = ctx.membro.tenantId
  const { doc } = achado
  if (doc.apagado) throw recusa('Este documento está na lixeira. Restaure antes de enviar nova versão.')

  const caminho = caminhoDoDocumento({
    tenantId,
    alvoTipo: doc.alvoTipo,
    alvoId: doc.processoId,
    documentoId: doc.id,
    versao: doc.versoes + 1,
  })
  const bucket = ctx.db.storage.from(BUCKET_GESTAO_DOCS)
  const { data: blob, error } = await bucket.download(caminho)
  if (error || !blob) throw recusa('O arquivo não chegou ao servidor. Envie de novo.')

  const inicio = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const veredito = inspecionarBytes(inicio, blob.size)
  if (!veredito.ok) {
    await bucket.remove([caminho])
    if (doc.versoes === 0) await descartarPendente(ctx.db, tenantId, doc.id)
    throw recusa(veredito.erro)
  }

  const r = await confirmarVersao(ctx.db, tenantId, doc.id, doc.versoes, {
    tamanho: blob.size,
    mime: veredito.mime,
    storagePath: caminho,
  })
  // Conflito NÃO apaga o objeto: a outra aba pode ter acabado de confirmar o mesmo caminho.
  if (r === 'conflito') throw recusa(CONFLITO, 409)
  const confirmado = (await carregarVisivel(ctx, doc.id)).doc
  await marcarPdfSeContrato(ctx.db, tenantId, confirmado)
  return confirmado
}

/**
 * URL assinada de 60 s. Lixeira, não confirmado, de outro tenant ou de processo
 * alheio: sem URL (404). O caminho vem da linha E é conferido contra a pasta do
 * tenant antes de assinar.
 */
export async function urlDeDownload(
  ctx: CtxDocs,
  id: string,
): Promise<{ doc: DocumentoGestao; url: string; expiraEmSegundos: number }> {
  const { doc, storagePath } = await carregarConfirmado(ctx, id)
  if (doc.apagado) throw naoEncontrado()
  if (!caminhoPertenceAoTenant(storagePath, ctx.membro.tenantId)) {
    logError('gestao.documento.caminho_fora_do_tenant', { tenantId: ctx.membro.tenantId, documentoId: doc.id })
    throw naoEncontrado()
  }
  const { data, error } = await ctx.db.storage
    .from(BUCKET_GESTAO_DOCS)
    .createSignedUrl(storagePath!, VALIDADE_DOWNLOAD_SEGUNDOS, { download: doc.nome })
  if (error || !data) {
    logError('gestao.documento.url_assinada', { tenantId: ctx.membro.tenantId, documentoId: doc.id, motivo: errMessage(error) })
    throw recusa('Não foi possível abrir o documento. Tente de novo.', 502)
  }
  return { doc, url: data.signedUrl, expiraEmSegundos: VALIDADE_DOWNLOAD_SEGUNDOS }
}

/** Regra do domínio valida; o update condicional impede a corrida (lixeira/conferido por outra aba). */
async function transicao(
  ctx: CtxDocs,
  id: string,
  validar: (estado: Estado, docId: string) => ReturnType<typeof conferirDocumento>,
  gravar: (versao: number) => Promise<DocumentoGestao | null>,
  extra?: (doc: DocumentoGestao) => string | null,
): Promise<DocumentoGestao> {
  const { doc } = await carregarConfirmado(ctx, id)
  const v = validar(estadoDe(doc), doc.id)
  if (!v.ok) throw recusa(v.erro)
  const erroExtra = extra?.(doc)
  if (erroExtra) throw recusa(erroExtra)
  const gravado = await gravar(doc.versoes)
  if (!gravado) throw recusa(CONFLITO, 409)
  return gravado
}

export const conferirDocumentoGestao = (ctx: CtxDocs, id: string) =>
  transicao(
    ctx,
    id,
    conferirDocumento,
    (v) => marcarConferido(ctx.db, ctx.membro.tenantId, id, v),
    // O domínio deixa conferir qualquer coisa; no servidor só se confere o que está enviado e fora da lixeira.
    (d) => (d.apagado ? 'Documento na lixeira.' : d.estado !== 'enviado' ? 'Este documento já foi conferido.' : null),
  )

/** Lixeira e restauração mexem na marca `pdf` do contrato (ver `gestao-venda-pdf.ts`). */
const comMarcaDePdf = async (ctx: CtxDocs, doc: DocumentoGestao): Promise<DocumentoGestao> => {
  await marcarPdfSeContrato(ctx.db, ctx.membro.tenantId, doc)
  return doc
}

export const apagarDocumentoGestao = async (ctx: CtxDocs, id: string) =>
  comMarcaDePdf(
    ctx,
    await transicao(
      ctx,
      id,
      (e, d) => apagarDocumento(e, d, { nome: ctx.membro.nome }),
      (v) => enviarParaLixeira(ctx.db, ctx.membro.tenantId, id, v, ctx.membro.nome),
    ),
  )

export const restaurarDocumentoGestao = async (ctx: CtxDocs, id: string) =>
  comMarcaDePdf(
    ctx,
    await transicao(
      ctx,
      id,
      restaurarDocumento,
      (v) => restaurarDaLixeira(ctx.db, ctx.membro.tenantId, id, v),
    ),
  )
