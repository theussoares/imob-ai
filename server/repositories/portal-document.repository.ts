import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { ContractPartyRole, PortalDocument, PortalDocumentInput } from '~~/shared/models/portal'
import { visibleDocumentsFor } from '~~/shared/utils/portal-access'
import {
  toPortalDocumentModel,
  toPortalDocumentRow,
  toPortalDocumentWithPath,
  type PortalDocumentWithPath,
} from '~~/server/mappers/portal-document.mapper'

type Client = SupabaseClient<Database>

/** Documentos de um contrato, para o PAINEL — rascunho incluído. */
export async function listDocuments(
  client: Client,
  tenantId: string,
  contractId: string,
): Promise<PortalDocument[]> {
  const { data, error } = await client
    .from('portal_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .order('competence', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toPortalDocumentModel)
}

/**
 * Documentos que ESTE cliente pode ver neste contrato.
 *
 * Filtra três vezes o mesmo fato, e nenhuma das três é sobra:
 *   - a query pede publicados e do contrato certo;
 *   - a RLS da 0028 aplica a regra de novo no banco;
 *   - `visibleDocumentsFor` aplica a regra de audiência em TypeScript.
 *
 * A terceira é a que importa quando o chamador passa o client de service role,
 * que ignora RLS. Ela é a mesma função que o download usa antes de assinar —
 * lista e download respondendo pela mesma regra é o que impede a lista dizer
 * uma coisa e o download outra.
 */
export async function listDocumentsForClient(
  client: Client,
  tenantId: string,
  contractId: string,
  roles: readonly ContractPartyRole[],
): Promise<PortalDocument[]> {
  // Sem papel no contrato não há documento visível, e a viagem ao banco não
  // tem como terminar em outra resposta.
  if (!roles.length) return []

  const { data, error } = await client
    .from('portal_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .not('published_at', 'is', null)
    .order('competence', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  return visibleDocumentsFor((data ?? []).map(toPortalDocumentModel), roles)
}

/**
 * O documento com o caminho no bucket, para assinar o download.
 *
 * NÃO checa permissão: quem chama tem que aplicar `canClientSeeDocument` com os
 * papéis da pessoa naquele contrato antes de assinar. A separação é proposital
 * — uma função que buscasse e autorizasse ao mesmo tempo tornaria fácil chamar
 * só a busca e achar que a autorização veio junto.
 */
export async function getDocumentWithPath(
  client: Client,
  tenantId: string,
  documentId: string,
): Promise<PortalDocumentWithPath | null> {
  const { data, error } = await client
    .from('portal_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', documentId)
    .maybeSingle()
  if (error) throw error
  return data ? toPortalDocumentWithPath(data) : null
}

/**
 * Registra o download na trilha (LGPD).
 *
 * Falha de gravação NÃO derruba o download: o cliente tem direito ao documento
 * dele, e negar o arquivo porque o log caiu troca um problema de auditoria por
 * um de acesso. Mas também não passa em silêncio — o erro sobe para quem chama
 * registrar no log da aplicação.
 */
export async function recordDocumentAccess(
  service: Client,
  tenantId: string,
  documentId: string,
  portalUserId: string,
  ip: string | null,
): Promise<void> {
  const { error } = await service.from('portal_document_access').insert({
    tenant_id: tenantId,
    document_id: documentId,
    portal_user_id: portalUserId,
    ip,
  })
  if (error) throw error
}


// ---------------------------------------------------------------------------
// Publicação pelo painel
// ---------------------------------------------------------------------------

/**
 * O caminho no bucket é da pasta DESTE tenant?
 *
 * ⚠️ Esta é a guarda mais importante deste arquivo, e ela existe porque o
 * `storagePath` vem do NAVEGADOR: o upload vai direto ao Storage, então o
 * caminho é dado do cliente, não do servidor.
 *
 * Sem ela, um membro da imobiliária A registraria uma linha em `portal_documents`
 * (no tenant A, que é o dele) apontando para um arquivo da pasta da imobiliária
 * B. A partir daí a policy do bucket casa `storage_path` com o nome do objeto,
 * vê que o cliente é parte de um contrato do tenant A, e **assina o download do
 * arquivo do tenant B**. As policies de storage impedem A de LER a pasta de B
 * diretamente, mas não impedem A de apontar para ela — quem fecha esse caminho é
 * este `startsWith`.
 *
 * A convenção do path é `<slug>/<contract_id>/<arquivo>`, a mesma da 0012 e da
 * 0028: o primeiro nível é sempre o slug do tenant.
 */
export function assertCaminhoDoTenant(storagePath: string, slug: string): void {
  const caminho = (storagePath || '').trim()

  // `..` escaparia da pasta do tenant mesmo com o prefixo certo.
  if (!caminho || caminho.includes('..')) {
    throw createError({ statusCode: 422, statusMessage: 'Caminho de arquivo inválido.' })
  }
  if (!caminho.startsWith(`${slug}/`)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Este arquivo não pertence a esta imobiliária.',
    })
  }
}

/**
 * Cria o documento como RASCUNHO.
 *
 * Confere antes que o contrato é deste tenant: sem isso, um id de contrato
 * alheio anexaria o documento ao contrato de outra imobiliária.
 */
export async function createDocument(
  client: Client,
  tenantId: string,
  slug: string,
  input: PortalDocumentInput,
  createdBy: string | null,
): Promise<PortalDocument> {
  assertCaminhoDoTenant(input.storagePath, slug)

  const { data: contrato } = await client
    .from('contracts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', input.contractId)
    .maybeSingle()
  if (!contrato) {
    throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }

  const { data, error } = await client
    .from('portal_documents')
    .insert(toPortalDocumentRow(input, tenantId, createdBy))
    .select('*')
    .single()
  if (error) throw error
  return toPortalDocumentModel(data)
}

/**
 * Publica ou volta para rascunho.
 *
 * Despublicar existe porque errar a categoria ou o público-alvo depois de
 * publicar é o caso em que a pressa importa: o documento já está visível para
 * quem não devia, e apagar levaria junto a trilha de quem baixou.
 */
export async function setDocumentPublished(
  client: Client,
  tenantId: string,
  documentId: string,
  publicado: boolean,
): Promise<PortalDocument> {
  const { data, error } = await client
    .from('portal_documents')
    .update({ published_at: publicado ? new Date().toISOString() : null })
    .eq('tenant_id', tenantId)
    .eq('id', documentId)
    .select('*')
    .single()
  if (error) throw error
  return toPortalDocumentModel(data)
}

/** Atualiza a audiência de um documento já criado. */
export async function setDocumentAudience(
  client: Client,
  tenantId: string,
  documentId: string,
  audience: ContractPartyRole[],
): Promise<PortalDocument> {
  const { data, error } = await client
    .from('portal_documents')
    .update({ audience })
    .eq('tenant_id', tenantId)
    .eq('id', documentId)
    .select('*')
    .single()
  if (error) throw error
  return toPortalDocumentModel(data)
}

/**
 * Apaga o documento.
 *
 * NÃO apaga o objeto no bucket aqui: `portal_document_access` tem FK para o
 * documento com `on delete cascade`, então apagar a linha já leva a trilha
 * junto — e o arquivo órfão no bucket é problema menor que uma trilha perdida.
 * Limpeza de órfãos é rotina de manutenção, não caminho de request.
 */
export async function deleteDocument(
  client: Client,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const { error } = await client
    .from('portal_documents')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', documentId)
  if (error) throw error
}
