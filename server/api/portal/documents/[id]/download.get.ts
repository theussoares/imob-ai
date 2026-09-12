import { rolesInContract } from '~~/server/repositories/contract.repository'
import {
  getDocumentForDownload,
  logDocumentAccess,
} from '~~/server/repositories/portal-document.repository'

/**
 * Download de um documento do portal.
 *
 * ⚠️ O endpoint mais sensível da Área do Cliente. É aqui que um erro entrega o
 * extrato de repasse do proprietário para o inquilino — ou o contrato de um
 * cliente para outro.
 *
 * ---------------------------------------------------------------------------
 * DUAS BARREIRAS, e a segunda só existe se o código não usar service role
 * ---------------------------------------------------------------------------
 *
 *   1. `getDocumentForDownload` aplica `canClientSeeDocument` em TypeScript
 *      (publicado + é parte + papel na audiência) e devolve null se não pode;
 *   2. a leitura do arquivo vai com o CLIENT DO USUÁRIO, então a policy de
 *      `storage.objects` roda com o JWT dele e refaz a mesma pergunta em SQL.
 *
 * Se a etapa 2 fosse feita com service role, a barreira 2 simplesmente não
 * existiria: service role ignora RLS. A service role aparece aqui uma única
 * vez, para GRAVAR a trilha de acesso — se o cliente pudesse inserir nela,
 * poderia forjar linhas e a trilha deixaria de valer como prova.
 *
 * ---------------------------------------------------------------------------
 * Por que ler o arquivo em vez de devolver URL assinada
 * ---------------------------------------------------------------------------
 *
 * O card previa `createSignedUrl`. Investigando antes de escrever: o cliente faz
 * `POST /object/sign/...`, que é uma operação de Storage DIFERENTE da leitura
 * autenticada — e a policy da 0028 libera só `object.get_authenticated` e
 * `object.get_authenticated_info` (os nomes que a documentação publica). Assinar
 * com o token do usuário provavelmente bateria numa operação fora dessa lista.
 *
 * O nome da operação de assinatura não está na documentação pública, e chutar
 * nome de operação DENTRO de uma policy de segurança é como acertar a senha por
 * tentativa: quando funciona, ninguém sabe dizer o que mais foi liberado junto.
 *
 * Então o download usa `download()`, que é `GET /object/{bucket}/{path}` — a
 * operação `object.get_authenticated`, documentada e já na lista. O servidor lê
 * com o token do cliente (a policy roda) e devolve os bytes.
 *
 * ✅ CONFIRMADO em produção (12/09/2026): o fluxo completo funcionou no tenant
 * `demo`, com inquilina e proprietário. Ou seja, o GET autenticado realmente
 * chega à policy como `object.get_authenticated` nesta versão do Storage — era
 * a única parte que não dava para provar por SQL, e agora está provada por uso.
 *
 * Dois efeitos colaterais são melhorias, não concessões:
 *   - a policy é verificada no instante da transferência, não na emissão de uma
 *     URL que ainda vai ser usada depois;
 *   - não existe URL para encaminhar no WhatsApp e um terceiro abrir dentro do
 *     prazo de validade.
 *
 * O custo é que os bytes passam pela função. Para contrato, boleto e recibo em
 * PDF isso é irrelevante; vistoria com muitas fotos é o caso a observar, e está
 * registrado como próximo passo (voltar para URL assinada exige confirmar o nome
 * da operação contra a versão do Storage em produção).
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)

  const documentId = getRouterParam(event, 'id')
  if (!documentId) throw createError({ statusCode: 400, statusMessage: 'Documento inválido.' })

  await assertDownloadRateLimit(serviceSupabase(), { tenantId: tenant.id, portalUserId })

  // Precisamos do contrato ANTES dos papéis: papel é atributo do vínculo, e a
  // audiência do documento é conferida contra o papel naquele contrato. Esta
  // leitura vai com o client do usuário, então a RLS já filtra o que não é dele.
  const { data: doc } = await client
    .from('portal_documents')
    .select('contract_id')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })

  const roles = await rolesInContract(client, portalUserId, doc.contract_id)
  const documento = await getDocumentForDownload(client, documentId, roles)
  // Barreira 1. Recusa e inexistente respondem igual, de propósito: distinguir
  // conta ao curioso quais documentos existem.
  if (!documento) {
    logWarn('portal.download_denied', {
      documentId,
      tenant: tenant.slug,
      portalUserId,
    })
    throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })
  }

  // Barreira 2: com o token do usuário, a policy de storage.objects roda.
  const { data: arquivo, error } = await client.storage
    .from('portal-docs')
    .download(documento.storagePath)

  if (error || !arquivo) {
    // Falha fechada. Se a policy recusou, o cliente não vê o arquivo mesmo que a
    // barreira 1 tenha deixado passar — que é precisamente o ponto dela existir.
    logError('portal.download_storage_failed', {
      documentId,
      tenant: tenant.slug,
      reason: error?.message,
    })
    throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })
  }

  await logDocumentAccess(serviceSupabase(), {
    tenantId: documento.tenantId,
    documentId: documento.id,
    portalUserId,
    ip: clientIpFrom((name) => getHeader(event, name)),
  })

  setHeader(event, 'content-type', documento.mime || 'application/octet-stream')
  // `attachment` em vez de `inline`: o navegador salva em vez de renderizar, e
  // um PDF malicioso não roda no nosso domínio (o bucket é alimentado pela
  // imobiliária, não por nós).
  setHeader(event, 'content-disposition', `attachment; filename="${nomeDeArquivo(documento.storagePath)}"`)
  // Documento de cliente não entra em cache compartilhado de CDN.
  setHeader(event, 'cache-control', 'private, no-store')

  return Buffer.from(await arquivo.arrayBuffer())
})

/**
 * Último segmento do path, higienizado.
 *
 * O path vem do banco, não do cliente — mas o header vai para o navegador, e
 * aspas ou quebra de linha aqui quebram o `Content-Disposition`.
 */
function nomeDeArquivo(storagePath: string): string {
  const ultimo = storagePath.split('/').pop() || 'documento'
  return ultimo.replace(/[^\w.\-]/g, '_')
}
