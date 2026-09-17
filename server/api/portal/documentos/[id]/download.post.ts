import { canClientSeeDocument } from '~~/shared/utils/portal-access'
import { nomeDeDownload } from '~~/shared/utils/portal-download'
import { ehUuid } from '~~/shared/utils/uuid'
import { getContractForClient } from '~~/server/repositories/contract.repository'
import {
  getDocumentWithPath,
  recordDocumentAccess,
} from '~~/server/repositories/portal-document.repository'

/** Vida da URL assinada. Suficiente para o navegador começar o download. */
const URL_TTL_SEGUNDOS = 60

/**
 * Devolve uma URL assinada de vida curta para o cliente baixar um documento.
 *
 * O card mais sensível da entrega. Três decisões que valem a leitura:
 *
 * **1. É POST, não GET.** O endpoint grava a trilha de acesso, e um GET é
 * disparado por prefetch do navegador, varredura de link e preview de
 * mensageiro. A trilha responde "quem baixou meu contrato?" e perde o sentido
 * se encher de downloads que ninguém fez.
 *
 * **2. A assinatura usa o token DO CLIENTE, não service role.** O card 2.3 dizia
 * o contrário, e a migration 0028 — escrita depois — mudou o desenho e explica
 * por quê: ela criou a policy `portal client reads own documents` no bucket
 * justamente para existir uma segunda barreira no banco. Service role IGNORA
 * RLS, então assinar com ela deixaria a policy como código morto e o
 * `canClientSeeDocument` abaixo como única proteção. Com o token do cliente, a
 * regra é aplicada duas vezes, em dois lugares que falham de formas diferentes.
 * A service role fica só para gravar a trilha, que o cliente não pode forjar.
 *
 * **3. Tudo que nega devolve 404.** "Não é seu", "não existe", "é rascunho" e
 * "isso nem é um uuid" respondem igual: um 403 — ou um 500 — confirmaria que o
 * documento existe, ou que aquele id é diferente dos outros, para quem trocou o
 * id na URL.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant, portalUserId } = await requirePortalUser(event)
  const documentId = getRouterParam(event, 'id') || ''

  // Id malformado morre aqui, de graça: `.eq('id', 'qualquer-coisa')` numa
  // coluna `uuid` faz o Postgres devolver 22P02 e o handler responder 500.
  if (!ehUuid(documentId)) {
    throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })
  }

  // Anti-abuso: impede baixar a carteira inteira em rajada. Como no resto do
  // repositório, falha na checagem deixa passar e registra — o limite não é
  // controle de acesso, e o controle de acesso vem logo abaixo.
  //
  // ⚠️ **O que este limite NÃO faz: impedir varredura de ids.** Ele conta linhas
  // de `portal_document_access`, e essa tabela só recebe linha lá embaixo, DEPOIS
  // de o documento existir, ser do contrato da pessoa e ser do papel dela. Uma
  // rajada de ids inválidos devolve 404 em todas, não grava nada, e o contador
  // fica em zero. Dizer o contrário aqui seria descrever uma proteção que não
  // existe.
  //
  // Não é descuido: contar TENTATIVA exigiria gravar as negadas, e a única
  // tabela à mão é a trilha de LGPD, que responde "quem baixou meu contrato?" e
  // perde o sentido se encher de download que ninguém fez — é a mesma razão de
  // o endpoint ser POST. O que fecha a varredura é o id ser `uuid` v4: adivinhar
  // um é 2^122, e o `ehUuid` acima já devolve 404 antes de tocar no banco.
  await assertSubmitRateLimit(serviceSupabase(), {
    table: 'portal_document_access',
    tenantId: tenant.id,
    column: 'portal_user_id',
    value: portalUserId,
    windowMs: 60 * 1000,
    max: 30,
    message: 'Muitos downloads seguidos. Tente novamente em um minuto.',
  })

  const doc = await getDocumentWithPath(client, tenant.id, documentId)
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })

  // Os papéis vêm do contrato, nunca do request. É o que impede alguém pedir o
  // documento do proprietário dizendo-se proprietário.
  const contrato = await getContractForClient(client, tenant.id, portalUserId, doc.contractId)
  if (!contrato) throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })

  // A regra, em TypeScript. Publicado + do contrato dele + endereçado ao papel
  // dele naquele contrato.
  if (!canClientSeeDocument(doc, contrato.roles)) {
    logWarn('portal.download_negado', {
      tenant: tenant.slug,
      document: documentId,
      // Sem PII: o id interno basta para investigar, o nome da pessoa não.
      papeis: contrato.roles.join(','),
    })
    throw createError({ statusCode: 404, statusMessage: 'Documento não encontrado.' })
  }

  // `download` põe `Content-Disposition: attachment` na URL assinada. Duas
  // consequências, e a segunda é a que importa: o arquivo baixa em vez de abrir
  // no lugar da página (por isso a tela pode usar `location.href`, que o Safari
  // não bloqueia), e ele chega com nome de gente em vez do uuid do bucket.
  const { data, error } = await client.storage
    .from('portal-docs')
    .createSignedUrl(doc.storagePath, URL_TTL_SEGUNDOS, {
      download: nomeDeDownload(doc.title, doc.storagePath),
    })

  if (error || !data?.signedUrl) {
    // ⚠️ Se este erro aparecer logo após o primeiro deploy, o suspeito é a lista
    // de operações em `storage.allow_any_operation` na 0028: se o nome da
    // operação mudou nesta versão do Storage, a policy recusa e o download falha
    // FECHADO — que é o modo certo de errar, mas precisa ser reconhecido rápido.
    logError('portal.assinatura_falhou', {
      tenant: tenant.slug,
      document: documentId,
      reason: error?.message,
    })
    throw createError({ statusCode: 502, statusMessage: 'Não foi possível preparar o download.' })
  }

  // A trilha é gravada por service role: se o próprio cliente pudesse inserir,
  // poderia forjar linhas e o registro deixaria de valer como prova.
  //
  // Falhar aqui NÃO derruba o download. O cliente tem direito ao documento
  // dele, e negar o arquivo porque o log caiu troca um problema de auditoria
  // por um de acesso. Mas não passa calado.
  try {
    await recordDocumentAccess(
      serviceSupabase(),
      tenant.id,
      documentId,
      portalUserId,
      clientIpFrom((name) => getHeader(event, name)),
    )
  } catch (e) {
    logError('portal.trilha_falhou', {
      tenant: tenant.slug,
      document: documentId,
      reason: (e as { message?: string })?.message,
    })
  }

  return { url: data.signedUrl, title: doc.title, expiraEm: URL_TTL_SEGUNDOS }
})
