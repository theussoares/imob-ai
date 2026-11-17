import { formatoPelaAssinatura, type MimeDeDocumento } from '~~/shared/utils/arquivo-documento'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Regras puras dos documentos do /gestao: nome, tipo, tamanho e caminho no
 * Storage. Ficam fora do repository e do endpoint para rodar em Node sem
 * Supabase — e porque o caminho é a barreira entre um tenant e o outro.
 *

 * O caminho do objeto é decidido SÓ por estas funções, a partir de ids que o
 * servidor já validou (RG e certidões são dado pessoal sensível). Alternativa descartada:
 * aceitar `storagePath` do navegador e conferir o prefixo (o que
 * `assertCaminhoDoTenant` faz no portal) — lá o upload é com a sessão do
 * membro; aqui o servidor emite a URL de upload, então não há motivo para o
 * cliente sequer saber a convenção.
 */

export const BUCKET_GESTAO_DOCS = 'gestao-docs'

/** 15 MB: o mesmo número do `file_size_limit` da 0061. */
export const LIMITE_BYTES_GESTAO_DOC = 15 * 1024 * 1024

/** Validade da URL de download. Curta: o link vaza em histórico e em print. */
export const VALIDADE_DOWNLOAD_SEGUNDOS = 60

export type AlvoTipo = 'venda' | 'locacao'
export const ALVO_TIPOS: readonly AlvoTipo[] = ['venda', 'locacao']

const MIME_POR_EXTENSAO: Record<string, MimeDeDocumento> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** `V-2026-0001`, `L-2026-0001`: letras, dígitos e hífen — nada que vire `..` ou `/`. */
const ID_ALVO = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/

export const ehAlvoTipo = (s: unknown): s is AlvoTipo => s === 'venda' || s === 'locacao'
export const ehIdDeAlvo = (s: unknown): s is string => typeof s === 'string' && ID_ALVO.test(s)

/** `venda:V-2026-0001` → `{ tipo, id }`; qualquer outra coisa → null. */
export function lerAlvo(s: unknown): { tipo: AlvoTipo; id: string } | null {
  if (typeof s !== 'string') return null
  const i = s.indexOf(':')
  if (i < 0) return null
  const tipo = s.slice(0, i)
  const id = s.slice(i + 1)
  return ehAlvoTipo(tipo) && ehIdDeAlvo(id) ? { tipo, id } : null
}

/** Só o nome do arquivo, sem pasta, sem caractere de controle, até 120 caracteres. */
export function limparNome(nome: string): string {
  const base = nome.replace(/\\/g, '/').split('/').pop() ?? ''
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120)
}

export function extensaoDe(nome: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nome.trim())
  return m ? m[1]!.toLowerCase() : ''
}

export type EnvioValidado = { ok: true; nome: string; mime: MimeDeDocumento } | { ok: false; erro: string }

/**
 * Confere o que o cliente DECLAROU antes de emitir a URL de upload. É triagem:
 * a decisão final é de `inspecionarBytes`, depois que o arquivo chega.
 */
export function validarEnvio(dados: { nome: unknown; tamanho: unknown; mime: unknown }): EnvioValidado {
  if (typeof dados.nome !== 'string' || !limparNome(dados.nome)) return { ok: false, erro: 'Escolha um arquivo.' }
  const nome = limparNome(dados.nome)
  const porExtensao = MIME_POR_EXTENSAO[extensaoDe(nome)]
  if (!porExtensao) return { ok: false, erro: 'Use PDF, JPG, PNG ou WEBP.' }
  // O Content-Type declarado tem de bater com a extensão: o bucket recusa pelo
  // Content-Type, então um desencontro aqui é upload que falharia depois.
  if (dados.mime !== porExtensao) return { ok: false, erro: 'O tipo do arquivo não confere com o nome.' }
  const tamanho = dados.tamanho
  if (typeof tamanho !== 'number' || !Number.isFinite(tamanho) || tamanho <= 0) {
    return { ok: false, erro: 'Arquivo vazio.' }
  }
  if (tamanho > LIMITE_BYTES_GESTAO_DOC) return { ok: false, erro: 'O arquivo passa de 15 MB.' }
  return { ok: true, nome, mime: porExtensao }
}

/**
 * Caminho do objeto: `tenant_id/<tipo>/<agregado>/<documento>/<versao>`.
 * Lança em vez de devolver caminho "limpo": entrada fora do formato é bug do
 * chamador, e arrumar silenciosamente esconderia o bug.
 */
export function caminhoDoDocumento(p: {
  tenantId: string
  alvoTipo: AlvoTipo
  alvoId: string
  documentoId: string
  versao: number
}): string {
  if (!ehUuid(p.tenantId) || !ehUuid(p.documentoId)) throw new Error('caminho do documento: id inválido')
  if (!ehAlvoTipo(p.alvoTipo) || !ehIdDeAlvo(p.alvoId)) throw new Error('caminho do documento: alvo inválido')
  if (!Number.isInteger(p.versao) || p.versao < 1) throw new Error('caminho do documento: versão inválida')
  return `${p.tenantId}/${p.alvoTipo}/${p.alvoId}/${p.documentoId}/${p.versao}`
}

/**
 * Última checagem antes de assinar: o caminho gravado na linha é da pasta deste
 * tenant? A linha só chega aqui por query com `tenant_id`, então é redundante
 * — e é exatamente por isso que existe: uma linha mal gravada (migração, SQL à
 * mão) não pode virar URL assinada de arquivo de outra imobiliária.
 */
export function caminhoPertenceAoTenant(path: string | null | undefined, tenantId: string): boolean {
  if (!path || path.includes('..') || path.includes('//')) return false
  return path.startsWith(`${tenantId}/`)
}

export type InspecaoBytes = { ok: true; mime: MimeDeDocumento } | { ok: false; erro: string }

/** Formato pelos primeiros bytes + tamanho real do objeto (não o declarado). */
export function inspecionarBytes(inicio: Uint8Array, tamanhoReal: number): InspecaoBytes {
  const mime = formatoPelaAssinatura(inicio)
  if (!mime) return { ok: false, erro: 'Formato não aceito. Envie PDF, JPG, PNG ou WEBP.' }
  if (tamanhoReal > LIMITE_BYTES_GESTAO_DOC) return { ok: false, erro: 'O arquivo passa de 15 MB.' }
  if (tamanhoReal <= 0) return { ok: false, erro: 'Arquivo vazio.' }
  return { ok: true, mime }
}
