import type { AiGenerationKind } from '~~/shared/models/ai-generation'
import { COTA_MENSAL_DESCRICAO } from '~~/shared/models/ai-generation'
import type { AiTone } from '~~/shared/models/ai-tone'
import type { ClienteIA, GeracaoIA } from '~~/server/utils/ai'
import type { EntradaDescricao } from '~~/server/utils/descricao-prompt'
import { montarPrompt } from '~~/server/utils/descricao-prompt'

/**
 * A ordem das guardas da geração — a parte mais arriscada do endpoint —,
 * extraída para uma função pura o suficiente para testar sem Nuxt nem rede.
 *
 * Todo repository entra por PARÂMETRO já com o client Supabase aplicado
 * (mesmo padrão de `server/repositories/*`), e o cliente de IA entra como uma
 * função a RESOLVER (`anthropicClient`), não já resolvida: é o que permite
 * testar "chave ausente" sem tocar em `useRuntimeConfig`, e é o que faz a
 * ordem abaixo (resolver antes de reservar) valer também aqui dentro, e não só
 * por convenção no endpoint.
 */
export interface GerarDescricaoDeps {
  reservarGeracao: (opts: {
    tenantId: string
    createdBy: string
    propertyId: string | null
    kind: AiGenerationKind
    model: string
  }) => Promise<string | null>
  concluirGeracao: (
    id: string,
    tenantId: string,
    dados: { inputTokens: number; outputTokens: number; model: string },
  ) => Promise<void>
  marcarFalha: (id: string, tenantId: string) => Promise<void>
  contarNoMes: (tenantId: string, kind: AiGenerationKind) => Promise<number>
  gerarTexto: (
    client: ClienteIA,
    opts: { system: string; prompt: string; imagemUrl?: string | null },
  ) => Promise<GeracaoIA>
  /** Não é o client já resolvido — ver o porquê no comentário da interface. */
  anthropicClient: () => ClienteIA
}

export interface GerarDescricaoCtx {
  tenantId: string
  userId: string
  propertyId: string | null
  entrada: EntradaDescricao
  tom: AiTone
  model: string
}

export async function gerarDescricao(
  deps: GerarDescricaoDeps,
  ctx: GerarDescricaoCtx,
): Promise<{ texto: string; restanteNoMes: number }> {
  // Resolvido ANTES da reserva: chave ausente é defeito de CONFIGURAÇÃO, não
  // consumo de verdade. Antes desta correção o client só era pedido depois de
  // `reservarGeracao`, e todo clique de toda imobiliária queimava uma geração
  // da cota até alguém notar `NUXT_ANTHROPIC_API_KEY` ausente — o mesmo
  // raciocínio que já valia para `sanitizarEntradaDescricao`/`getAiTone`
  // (ver o endpoint) agora vale para o client também.
  const client = deps.anthropicClient()

  // Reserva ANTES de chamar o provedor — senão não é cota, é contagem de
  // gasto que já aconteceu.
  const geracaoId = await deps.reservarGeracao({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    propertyId: ctx.propertyId,
    kind: 'descricao',
    model: ctx.model,
  })
  if (!geracaoId) {
    throw createError({
      statusCode: 429,
      statusMessage: `Limite de ${COTA_MENSAL_DESCRICAO} gerações deste mês atingido.`,
    })
  }

  const { system, prompt } = montarPrompt(ctx.entrada, ctx.tom)

  let resultado: GeracaoIA
  try {
    resultado = await deps.gerarTexto(client, { system, prompt, imagemUrl: ctx.entrada.imagemUrl })
  } catch (e) {
    // A reserva CONTINUA contando: tentativa que falha consome cota, e é isso
    // que faz o freio valer contra um loop de erro. Só o status da linha muda.
    await deps.marcarFalha(geracaoId, ctx.tenantId)
    throw e
  }

  try {
    await deps.concluirGeracao(geracaoId, ctx.tenantId, {
      inputTokens: resultado.inputTokens,
      outputTokens: resultado.outputTokens,
      model: resultado.model,
    })
  } catch (e) {
    // Não derruba a resposta — o corretor recebe o texto. Mas grita: é consumo
    // real sem contagem de token, e descobrir isso pela fatura é o pior caminho.
    logError('ia.registro_falhou', { tenant: ctx.tenantId, id: geracaoId, reason: errMessage(e) })
  }

  const usadas = await deps.contarNoMes(ctx.tenantId, 'descricao').catch(() => COTA_MENSAL_DESCRICAO)
  return { texto: resultado.texto, restanteNoMes: Math.max(0, COTA_MENSAL_DESCRICAO - usadas) }
}
