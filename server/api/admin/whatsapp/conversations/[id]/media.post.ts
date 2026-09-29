import { janelaAberta, mimeBase, mimeDoCaminho, prefixoDeEnvio, previa, problemaNoAnexo, WHATSAPP_ENVIO, WHATSAPP_LEGENDA_MAX } from '~~/shared/models/whatsapp'
import { getConversationState } from '~~/server/repositories/whatsapp.repository'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { conexaoDaConversa, erroDoEnvio, registrarSaida } from '~~/server/utils/whatsapp-envio'
import { BUCKET_MIDIA } from '~~/server/utils/whatsapp-midia'

/**
 * A Meta busca o arquivo por aqui. Uma hora cobre as retentativas dela; o
 * link dá acesso ao arquivo a quem o tiver nesse tempo, e só a Meta o recebe.
 */
const LINK_TTL_SEGUNDOS = 3600

/** `<tenant>/<conversa>/out-<uuid>.<ext>` — exatamente o que `upload.post.ts` gera. */
const CAMINHO_DE_ENVIO = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/out-[0-9a-f-]{36}\.[a-z0-9]{2,5}$/

/**
 * Segundo passo do envio de arquivo: o navegador já subiu no bucket; aqui o
 * servidor confere o que subiu e manda pela Meta.
 *
 * O caminho vem do body, então é conferido contra a pasta DESTA conversa
 * deste tenant — senão bastaria mandar o caminho de um arquivo que outro
 * cliente enviou para ele sair, pelo WhatsApp, para outra pessoa.
 *
 * O TAMANHO é lido do objeto no Storage, não do que o navegador disse no
 * primeiro passo. O tipo, não dá para provar: o Storage guarda o rótulo que o
 * navegador mandou no upload, sem olhar o conteúdo. O que se confere é que o
 * rótulo bate com a extensão que o servidor escolheu — o alcance de um rótulo
 * falso é o membro mandar ao próprio cliente um arquivo que ele já poderia
 * mandar pelo celular.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, user } = await requireTenantMember(event)
  await exigirWhatsapp(tenant.id)
  const id = idDeRota(getRouterParam(event, 'id'))
  const body = await readBody<{ path?: unknown; caption?: unknown; filename?: unknown }>(event)
  const caminho = typeof body?.path === 'string' ? body.path : ''
  const legenda = typeof body?.caption === 'string' ? body.caption.trim().slice(0, WHATSAPP_LEGENDA_MAX) || null : null
  const nome = typeof body?.filename === 'string' ? body.filename.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 120) || null : null

  if (!CAMINHO_DE_ENVIO.test(caminho) || !caminho.startsWith(prefixoDeEnvio(tenant.id, id))) {
    throw createError({ statusCode: 422, statusMessage: 'Arquivo inválido.' })
  }
  const mime = mimeDoCaminho(caminho)
  const regra = mime ? WHATSAPP_ENVIO[mime] : undefined
  if (!mime || !regra) throw createError({ statusCode: 422, statusMessage: 'Arquivo inválido.' })

  const state = await getConversationState(client, tenant.id, id)
  if (!state) throw createError({ statusCode: 404, statusMessage: 'Conversa não encontrada.' })
  if (!janelaAberta(state.lastInboundAt, new Date())) {
    throw createError({ statusCode: 422, statusMessage: 'Passaram 24h desde a última mensagem do cliente. Arquivo só pode ser enviado com a conversa aberta.' })
  }

  const service = serviceSupabase()
  const bucket = service.storage.from(BUCKET_MIDIA)
  const pasta = caminho.slice(0, caminho.lastIndexOf('/'))
  const arquivo = caminho.slice(caminho.lastIndexOf('/') + 1)
  const { data: lista, error: eLista } = await bucket.list(pasta, { search: arquivo, limit: 1 })
  const objeto = lista?.find((o) => o.name === arquivo)
  if (eLista || !objeto) throw createError({ statusCode: 422, statusMessage: 'O arquivo não chegou. Tente anexar de novo.' })
  const meta = (objeto.metadata ?? {}) as { size?: number; mimetype?: string }
  const problema = problemaNoAnexo(mimeBase(meta.mimetype) || mime, meta.size ?? 0)
  if (problema || (meta.mimetype && mimeBase(meta.mimetype) !== mime)) {
    await bucket.remove([caminho])
    throw createError({ statusCode: 422, statusMessage: problema ?? 'O arquivo não é do tipo que foi anexado.' })
  }

  const { data: assinada, error: eUrl } = await bucket.createSignedUrl(caminho, LINK_TTL_SEGUNDOS)
  if (eUrl || !assinada?.signedUrl) throw createError({ statusCode: 502, statusMessage: 'Não foi possível preparar o arquivo.' })

  const { conexao } = await conexaoDaConversa(service, tenant.id, state.accountId)
  let wamid: string
  try {
    ;({ wamid } = await cloudApi().enviarMidia(conexao, state.waId, {
      tipo: regra.tipo,
      link: assinada.signedUrl,
      legenda,
      nomeDoArquivo: nome,
    }))
  } catch (e) {
    // Não saiu: o arquivo não fica no bucket sem mensagem que o explique.
    await bucket.remove([caminho])
    erroDoEnvio(e, tenant.slug)
  }

  await registrarSaida(service, tenant, user.id, state, {
    wamid,
    type: regra.tipo,
    // Áudio vai sem legenda para a Meta; o histórico também não a mostra.
    body: regra.tipo === 'audio' ? null : legenda,
    media: { id: null, mime, filename: regra.tipo === 'document' ? nome : null, path: caminho, size: meta.size },
  })
  return { ok: true, tipo: regra.tipo }
})
