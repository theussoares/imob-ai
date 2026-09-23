import { descricaoIaAtiva } from '~~/server/utils/entitlement'
import { anthropicClient, gerarTexto } from '~~/server/utils/ai'
import { COTA_MENSAL_DESCRICAO } from '~~/shared/models/ai-generation'
import { montarPrompt, resolverPropertyId, sanitizarEntradaDescricao } from '~~/server/utils/descricao-prompt'
import {
  concluirGeracao,
  contarNoMes,
  marcarFalha,
  reservarGeracao,
} from '~~/server/repositories/ai-generation.repository'
import { getPropertyById } from '~~/server/repositories/property.repository'
import { getAiTone } from '~~/server/repositories/tenant.repository'

/**
 * Gera ou reescreve a descrição de um imóvel.
 *
 * ⚠️ Este endpoint NÃO grava a descrição. Ele devolve o texto; quem salva
 * continua sendo o `PUT` existente (`[id].put.ts`), depois que o corretor leu.
 * Isso não é economia de código: é a trava contra publicidade enganosa — a IA
 * pode inventar atributo a partir da foto (ver `descricao-prompt.ts`) —, e ela
 * só vale enquanto não existir caminho que publique sem revisão humana.
 *
 * O id de rota tem a forma conferida por `resolverPropertyId`, que chama
 * `ehUuid(...)` dentro de `descricao-prompt.ts` — não aqui, porque o teste
 * deste arquivo precisaria de `defineEventHandler`, que não existe fora do
 * runtime do Nuxt (ver o comentário de `resolverPropertyId`). Malformado
 * responde 404, não 400: é o mesmo endpoint que já trata "de outra
 * imobiliária" como 404, e as duas respostas precisam ser indistinguíveis.
 */
export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantMember(event)

  // Entitlement ANTES de tudo — inclusive antes de tocar no imóvel: sem o
  // recurso contratado, nada aqui deveria nem confirmar se o id existe.
  if (!(await descricaoIaAtiva(tenant.id))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'A descrição por IA não está contratada para esta imobiliária.',
    })
  }

  const propertyId = resolverPropertyId(getRouterParam(event, 'id') ?? '')
  const db = serviceSupabase()

  // Imóvel de OUTRA imobiliária é 404, não 403. O tenant sai do contexto,
  // NUNCA do body — aceitar `tenantId` do request deixaria qualquer membro
  // gerar descrição no acervo de outra imobiliária.
  if (propertyId) {
    const existente = await getPropertyById(db, tenant.id, propertyId)
    if (!existente) throw createError({ statusCode: 404, statusMessage: 'Imóvel não encontrado.' })
  }

  const config = useRuntimeConfig()
  const entrada = sanitizarEntradaDescricao(await readBody(event), config.public.supabaseUrl)
  // Antes da reserva de cota: se a leitura do tom falhar, é defeito de
  // configuração/banco, não vale gastar uma reserva por isso.
  const tom = await getAiTone(db, tenant.id)

  // Reserva ANTES de chamar o provedor — senão não é cota, é contagem de
  // gasto que já aconteceu.
  const geracaoId = await reservarGeracao(db, {
    tenantId: tenant.id,
    createdBy: user.id,
    propertyId,
    kind: 'descricao',
    model: config.aiModel,
  })
  if (!geracaoId) {
    throw createError({
      statusCode: 429,
      statusMessage: `Limite de ${COTA_MENSAL_DESCRICAO} gerações deste mês atingido.`,
    })
  }

  const { system, prompt } = montarPrompt(entrada, tom)

  let resultado
  try {
    resultado = await gerarTexto(anthropicClient(), { system, prompt, imagemUrl: entrada.imagemUrl })
  } catch (e) {
    // A reserva CONTINUA contando: tentativa que falha consome cota, e é isso
    // que faz o freio valer contra um loop de erro. Só o status da linha muda.
    await marcarFalha(db, geracaoId, tenant.id)
    throw e
  }

  try {
    await concluirGeracao(db, geracaoId, tenant.id, {
      inputTokens: resultado.inputTokens,
      outputTokens: resultado.outputTokens,
      model: resultado.model,
    })
  } catch (e) {
    // Não derruba a resposta — o corretor recebe o texto. Mas grita: é consumo
    // real sem contagem de token, e descobrir isso pela fatura é o pior caminho.
    logError('ia.registro_falhou', { tenant: tenant.id, id: geracaoId, reason: errMessage(e) })
  }

  const usadas = await contarNoMes(db, tenant.id, 'descricao').catch(() => COTA_MENSAL_DESCRICAO)
  return { texto: resultado.texto, restanteNoMes: Math.max(0, COTA_MENSAL_DESCRICAO - usadas) }
})
