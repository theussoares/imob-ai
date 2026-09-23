import { descricaoIaAtiva } from '~~/server/utils/entitlement'
import { anthropicClient, gerarTexto } from '~~/server/utils/ai'
import { sanitizarEntradaDescricao } from '~~/server/utils/descricao-prompt'
import { gerarDescricao } from '~~/server/utils/gerar-descricao'
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
 * A ordem das guardas de cota (reserva antes do provedor, `marcarFalha` no
 * catch, client resolvido antes da reserva) mora em `gerar-descricao.ts`, não
 * aqui — é o que permite testar essa ordem sem subir o Nuxt. Este arquivo faz
 * só o que depende do request: autentica, confere entitlement, resolve e
 * confere posse do imóvel, saneia a entrada e lê o tom.
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

  // `idDeRota` (não `resolverPropertyId`, removida): a forma do id precisa ser
  // uma chamada real NESTE arquivo, porque `test/server/id-de-rota.test.ts`
  // varre o texto de cada endpoint atrás dela — um helper que a chama em outro
  // arquivo passa no teste sem garantir nada se alguém trocar a linha abaixo
  // por um `getRouterParam` cru. Malformado é 400 (id nunca existe, não há o
  // que confirmar); "de outra imobiliária" continua sendo 404, abaixo.
  const bruto = getRouterParam(event, 'id') ?? ''
  const propertyId = bruto === 'novo' ? null : idDeRota(bruto, 'Imóvel')

  const db = serviceSupabase()

  // Imóvel de OUTRA imobiliária é 404, não 403. O tenant sai do contexto,
  // NUNCA do body — aceitar `tenantId` do request deixaria qualquer membro
  // gerar descrição no acervo de outra imobiliária.
  if (propertyId) {
    const existente = await getPropertyById(db, tenant.id, propertyId)
    if (!existente) throw createError({ statusCode: 404, statusMessage: 'Imóvel não encontrado.' })
  }

  const config = useRuntimeConfig()
  const entrada = sanitizarEntradaDescricao(
    await readBody(event),
    segredoDeRuntime(config.public.supabaseUrl, 'SUPABASE_URL'),
  )
  const tom = await getAiTone(db, tenant.id)

  return gerarDescricao(
    {
      reservarGeracao: (opts) => reservarGeracao(db, opts),
      concluirGeracao: (id, tenantId, dados) => concluirGeracao(db, id, tenantId, dados),
      marcarFalha: (id, tenantId) => marcarFalha(db, id, tenantId),
      contarNoMes: (tenantId, kind) => contarNoMes(db, tenantId, kind),
      gerarTexto,
      anthropicClient,
    },
    {
      tenantId: tenant.id,
      userId: user.id,
      propertyId,
      entrada,
      tom,
      model: config.aiModel,
    },
  )
})
