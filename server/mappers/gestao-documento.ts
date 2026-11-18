import { rotuloQuando } from '~~/layers/gestao/domain/fuso'
import type { CategoriaDocumento, Documento, EstadoDocumento } from '~~/layers/gestao/domain/types'
import type { AlvoTipo } from '~~/server/utils/gestao-documento-regras'

/** Linha de `gestao_documentos` (0061). Fica aqui, e não em `database.types`, até a tabela entrar nos tipos gerados. */
export interface GestaoDocumentoRow {
  id: string
  tenant_id: string
  alvo_tipo: AlvoTipo
  alvo_id: string
  requisito: string | null
  nome: string
  categoria: CategoriaDocumento
  estado: EstadoDocumento
  tamanho: number | string
  versao: number
  mime: string | null
  storage_path: string | null
  enviado_por: string
  apagado_por: string | null
  apagado_em: string | null
  created_at: string
  updated_at: string
}

/** Colunas de leitura comum: sem `storage_path`. Só `COLUNAS_COM_CAMINHO` o traz, e só o fluxo de download/confirmação a usa. */
export const COLUNAS_DOCUMENTO =
  'id, tenant_id, alvo_tipo, alvo_id, requisito, nome, categoria, estado, tamanho, versao, mime, enviado_por, apagado_por, apagado_em, created_at, updated_at'
export const COLUNAS_COM_CAMINHO = `${COLUNAS_DOCUMENTO}, storage_path`

export interface DocumentoGestao extends Documento {
  alvoTipo: AlvoTipo
}

/** «dd/mm/aaaa hh:mm» no fuso do painel: o servidor roda em UTC e o texto é para quem lê no painel. */
export const quandoBr = (iso: string): string => rotuloQuando(iso)

/**
 * Row → modelo do domínio. Não carrega `storage_path`, `mime` nem `tenant_id`:
 * o caminho do bucket não pode chegar à tela (o cliente não o usa e, se um dia
 * confiar nele, vira a brecha que a 0061 existe para evitar).
 */
export function toDocumentoGestao(r: GestaoDocumentoRow): DocumentoGestao {
  return {
    id: r.id,
    nome: r.nome,
    categoria: r.categoria,
    processoId: r.alvo_id,
    alvoTipo: r.alvo_tipo,
    estado: r.estado,
    tamanho: Number(r.tamanho),
    versoes: r.versao,
    enviadoPor: r.enviado_por,
    ...(r.requisito ? { requisito: r.requisito } : {}),
    apagado: r.apagado_em ? { quem: r.apagado_por ?? '', quando: quandoBr(r.apagado_em) } : null,
  }
}
