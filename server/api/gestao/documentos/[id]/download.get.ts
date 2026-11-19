import { requireGestaoMember } from '~~/server/utils/gestao-auth'
import { auditarDocumento } from '~~/server/utils/gestao-documento-evento'
import { urlDeDownload } from '~~/server/utils/gestao-documentos'

/** URL assinada de 60 s. O download é auditado ANTES de a URL sair; sem registro, sem URL. */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  const { doc, url, expiraEmSegundos } = await urlDeDownload(ctx, idDeRota(getRouterParam(event, 'id')))
  await auditarDocumento(ctx, 'Baixou o documento', doc.id, { obrigatorio: true })
  return { url, expiraEmSegundos }
})
