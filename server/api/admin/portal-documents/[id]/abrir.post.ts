import { nomeDeDownload } from '~~/shared/utils/portal-download'
import { getDocumentWithPath } from '~~/server/repositories/portal-document.repository'

/** Vida curta: é só o tempo de o navegador abrir a aba. */
const URL_TTL_SEGUNDOS = 60

/**
 * URL assinada para a imobiliária conferir um documento que ela mesma enviou.
 *
 * Faltava: o painel subia, publicava e apagava, mas não abria — a imobiliária
 * publicava para o cliente um arquivo que não conseguia ver.
 *
 * POST pelo mesmo motivo do download do portal: prefetch e preview de link não
 * devem gerar URL assinada. Aqui não há trilha de LGPD a gravar (quem abre é a
 * própria imobiliária, dona do arquivo), então a diferença para o do portal é
 * só a autorização: ser membro do tenant e o documento ser dele.
 *
 * Assinado com o client do MEMBRO, não com service_role: a policy
 * `member read portal-docs` (0028) confere a pasta do slug de novo, no banco.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  const id = idDeRota(getRouterParam(event, 'id'))

  const doc = await getDocumentWithPath(client, tenant.id, id)
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })

  const baixar = getQuery(event).baixar === '1'
  const { data, error } = await client.storage
    .from('portal-docs')
    .createSignedUrl(doc.storagePath, URL_TTL_SEGUNDOS, baixar ? { download: nomeDeDownload(doc.title, doc.storagePath) } : undefined)
  if (error || !data?.signedUrl) {
    logError('admin.documento_assinatura_falhou', { tenant: tenant.slug, document: id, reason: error?.message })
    throw createError({ statusCode: 502, statusMessage: 'Não foi possível abrir o documento.' })
  }
  return { url: data.signedUrl }
})
