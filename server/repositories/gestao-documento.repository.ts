import type { SupabaseClient } from '@supabase/supabase-js'
import type { CategoriaDocumento } from '~~/layers/gestao/domain/types'
import {
  COLUNAS_COM_CAMINHO,
  COLUNAS_DOCUMENTO,
  toDocumentoGestao,
  type DocumentoGestao,
  type GestaoDocumentoRow,
} from '~~/server/mappers/gestao-documento'
import type { AlvoTipo } from '~~/server/utils/gestao-documento-regras'

/**
 * Acesso a `gestao_documentos`. Toda query leva `tenant_id`: a service_role
 * ignora RLS, então o filtro é a única barreira entre as imobiliárias.
 *
 * Linha `pendente` (upload não confirmado) NUNCA aparece nas listas: o
 * navegador pode abandonar o envio no meio, e um item fantasma na tela de
 * documentos seria pior do que nenhum.
 */

/** Limite de lista da fase (plano): 200, mais recentes primeiro. */
export const LIMITE_LISTA = 200

export interface DocumentoComCaminho {
  doc: DocumentoGestao
  /** Interno: nunca vai para a resposta. */
  storagePath: string | null
  mime: string | null
}

export async function listarDocumentosDoAlvo(
  db: SupabaseClient,
  tenantId: string,
  alvo: { tipo: AlvoTipo; id: string },
  opcoes: { lixeira?: boolean } = {},
): Promise<DocumentoGestao[]> {
  let q = db
    .from('gestao_documentos')
    .select(COLUNAS_DOCUMENTO)
    .eq('tenant_id', tenantId)
    .eq('alvo_tipo', alvo.tipo)
    .eq('alvo_id', alvo.id)
    .not('estado', 'eq', 'pendente')
  q = opcoes.lixeira ? q.not('apagado_em', 'is', null) : q.is('apagado_em', null)
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(LIMITE_LISTA)
  if (error) throw error
  return ((data ?? []) as unknown as GestaoDocumentoRow[]).map(toDocumentoGestao)
}

/**
 * Lixeira do tenant. `alvos` = ids visíveis a quem pergunta, por tipo; `null`
 * = vê tudo (perfil com `verTodos`). Lista vazia devolve vazio SEM ir ao banco —
 * `.in('alvo_id', [])` não é consulta que valha confiar.
 */
export async function listarLixeira(
  db: SupabaseClient,
  tenantId: string,
  alvos: { venda: string[]; locacao: string[] } | null,
): Promise<DocumentoGestao[]> {
  const base = () =>
    db
      .from('gestao_documentos')
      .select(COLUNAS_DOCUMENTO)
      .eq('tenant_id', tenantId)
      .not('estado', 'eq', 'pendente')
      .not('apagado_em', 'is', null)

  const consultas: { tipo: AlvoTipo | null; ids: string[] | null }[] = alvos
    ? (['venda', 'locacao'] as const).filter((t) => alvos[t].length).map((t) => ({ tipo: t, ids: alvos[t] }))
    : [{ tipo: null, ids: null }]

  const linhas: GestaoDocumentoRow[] = []
  for (const c of consultas) {
    let q = base()
    if (c.tipo) q = q.eq('alvo_tipo', c.tipo)
    if (c.ids) q = q.in('alvo_id', c.ids)
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(LIMITE_LISTA)
    if (error) throw error
    linhas.push(...((data ?? []) as unknown as GestaoDocumentoRow[]))
  }
  return linhas
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, LIMITE_LISTA)
    .map(toDocumentoGestao)
}

/** Ids por consulta: o `in (...)` vai na URL, e milhares de uuid estouram o limite dela. */
const LOTE_IDS = 100
const BLOCO_DOCS = 1000

/**
 * Documentos `enviado` (ainda sem conferência) dos contratos `alvoIds`, para o número do
 * Dashboard. Recebe os ids que quem pergunta enxerga: o corretor não conta documento de
 * contrato alheio. Lista vazia não vai ao banco (`.in('alvo_id', [])` não vale confiar).
 *
 * É CONTAGEM, então não pode cortar em 200: lê todos, em lotes de ids e, dentro do lote, em
 * blocos de 1000 linhas (o corte do PostgREST).
 */
export async function listarParaConferir(db: SupabaseClient, tenantId: string, alvoIds: string[]): Promise<DocumentoGestao[]> {
  const linhas: GestaoDocumentoRow[] = []
  for (let i = 0; i < alvoIds.length; i += LOTE_IDS) {
    const lote = alvoIds.slice(i, i + LOTE_IDS)
    for (let de = 0; ; de += BLOCO_DOCS) {
      const { data, error } = await db
        .from('gestao_documentos')
        .select(COLUNAS_DOCUMENTO)
        .eq('tenant_id', tenantId)
        .eq('estado', 'enviado')
        .is('apagado_em', null)
        .in('alvo_id', lote)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(de, de + BLOCO_DOCS - 1)
      if (error) throw error
      const bloco = (data ?? []) as unknown as GestaoDocumentoRow[]
      linhas.push(...bloco)
      if (bloco.length < BLOCO_DOCS) break
    }
  }
  return linhas.map(toDocumentoGestao)
}

/** Teto da leitura que alimenta a tela Documentos (ela filtra e conta em memória; ver `paginaDeDocumentos`). */
export const LIMITE_DOCS_PAGINA = 5000

/**
 * Documentos de VENDA do tenant, dentro e fora da lixeira, sem os `pendente`. `alvoIds` presente restringe
 * aos processos dele (corretor, ou `?processo=`), em lotes de 100 ids; ausente = o tenant inteiro (quem
 * chama descarta o que não for de processo visível). Lê em blocos de 1000 até `LIMITE_DOCS_PAGINA`;
 * `truncado` avisa que passou do teto.
 */
export async function listarDocumentosDeVendas(
  db: SupabaseClient,
  tenantId: string,
  alvoIds: string[] | null,
): Promise<{ docs: DocumentoGestao[]; truncado: boolean }> {
  const linhas: GestaoDocumentoRow[] = []
  const lotes = alvoIds === null ? [null] : Array.from({ length: Math.ceil(alvoIds.length / LOTE_IDS) }, (_, i) => alvoIds.slice(i * LOTE_IDS, (i + 1) * LOTE_IDS))
  for (const lote of lotes) {
    for (let de = 0; ; de += BLOCO_DOCS) {
      let q = db
        .from('gestao_documentos')
        .select(COLUNAS_DOCUMENTO)
        .eq('tenant_id', tenantId)
        .eq('alvo_tipo', 'venda')
        .not('estado', 'eq', 'pendente')
      if (lote) q = q.in('alvo_id', lote)
      const { data, error } = await q.order('updated_at', { ascending: false }).order('id', { ascending: false }).range(de, de + BLOCO_DOCS - 1)
      if (error) throw error
      const bloco = (data ?? []) as unknown as GestaoDocumentoRow[]
      linhas.push(...bloco)
      if (linhas.length >= LIMITE_DOCS_PAGINA) return { docs: linhas.slice(0, LIMITE_DOCS_PAGINA).map(toDocumentoGestao), truncado: true }
      if (bloco.length < BLOCO_DOCS) break
    }
  }
  return { docs: linhas.map(toDocumentoGestao), truncado: false }
}

/** Uma linha por id, com o caminho — para confirmar, baixar, conferir e apagar. Inclui `pendente`. */
export async function obterDocumento(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<DocumentoComCaminho | null> {
  const { data, error } = await db
    .from('gestao_documentos')
    .select(COLUNAS_COM_CAMINHO)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as GestaoDocumentoRow
  return { doc: toDocumentoGestao(row), storagePath: row.storage_path, mime: row.mime }
}

export async function criarDocumentoPendente(
  db: SupabaseClient,
  tenantId: string,
  novo: {
    alvoTipo: AlvoTipo
    alvoId: string
    nome: string
    categoria: CategoriaDocumento
    requisito: string | null
    enviadoPor: string
  },
): Promise<string> {
  const { data, error } = await db
    .from('gestao_documentos')
    .insert({
      tenant_id: tenantId,
      alvo_tipo: novo.alvoTipo,
      alvo_id: novo.alvoId,
      nome: novo.nome,
      categoria: novo.categoria,
      requisito: novo.requisito,
      enviado_por: novo.enviadoPor,
      estado: 'pendente',
      versao: 0,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Remove a linha de um envio que nunca virou documento (versão 0). Nunca toca em documento confirmado. */
export async function descartarPendente(db: SupabaseClient, tenantId: string, id: string): Promise<void> {
  const { error } = await db
    .from('gestao_documentos')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('estado', 'pendente')
    .eq('versao', 0)
  if (error) throw error
}

/**
 * Grava a versão confirmada. `versao = versaoAnterior` no where é a concorrência
 * otimista: duas abas confirmando a mesma troca → a segunda não acerta linha e
 * recebe `conflito`. Substituir volta o estado para `enviado` (conferência
 * anterior era de outro arquivo), como `substituirDocumento` do domínio.
 */
export async function confirmarVersao(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  versaoAnterior: number,
  v: { tamanho: number; mime: string; storagePath: string },
): Promise<'ok' | 'conflito'> {
  const { data, error } = await db
    .from('gestao_documentos')
    .update({
      versao: versaoAnterior + 1,
      tamanho: v.tamanho,
      mime: v.mime,
      storage_path: v.storagePath,
      estado: 'enviado',
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('versao', versaoAnterior)
    // Documento apagado entre a leitura e a gravação não ganha versão nova.
    .is('apagado_em', null)
    .select('id')
    .maybeSingle()
  if (error) throw error
  return data ? 'ok' : 'conflito'
}

async function atualizar(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  versao: number,
  campos: Record<string, unknown>,
  condicao: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<DocumentoGestao | null> {
  const q = db
    .from('gestao_documentos')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    // A versão lida pelo chamador: se outra aba trocou o arquivo no meio, não acerta linha (conflito).
    .eq('versao', versao)
    .not('estado', 'eq', 'pendente')
  // `maybeSingle`: zero linhas é 404 para o chamador, não 500 (ver portal-document.repository).
  const { data, error } = await condicao(q).select(COLUNAS_DOCUMENTO).maybeSingle()
  if (error) throw error
  return data ? toDocumentoGestao(data as unknown as GestaoDocumentoRow) : null
}

/** Só marca conferido o que está `enviado` e fora da lixeira. */
export const marcarConferido = (db: SupabaseClient, tenantId: string, id: string, versao: number) =>
  atualizar(db, tenantId, id, versao, { estado: 'conferido' }, (q) => q.eq('estado', 'enviado').is('apagado_em', null))

export const enviarParaLixeira = (db: SupabaseClient, tenantId: string, id: string, versao: number, quem: string) =>
  atualizar(db, tenantId, id, versao, { apagado_por: quem, apagado_em: new Date().toISOString() }, (q) =>
    q.is('apagado_em', null),
  )

export const restaurarDaLixeira = (db: SupabaseClient, tenantId: string, id: string, versao: number) =>
  atualizar(db, tenantId, id, versao, { apagado_por: null, apagado_em: null }, (q) => q.not('apagado_em', 'is', null))
