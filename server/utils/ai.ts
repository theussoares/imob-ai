import Anthropic from '@anthropic-ai/sdk'

/**
 * Fronteira única com o provedor de IA.
 *
 * Existe para que o token seja medido UMA vez só — sem esse número a cota não
 * tem o que contar — e para que o erro do provedor vire status HTTP num lugar
 * só. A alternativa (SDK direto no endpoint) parecia mais curta, mas a segunda
 * chamada de IA traria o próprio tratamento de erro e as duas discordariam: é
 * o defeito que `entitlement.ts` documenta ter custado o PR #27.
 *
 * ⚠️ O client entra por PARÂMETRO, como nos repositories. É o que permite
 * testar sem rede e sem `useRuntimeConfig`, que não existe fora do runtime do
 * Nuxt.
 */

// Reexportadas de shared/ e não declaradas aqui: quem conta a cota é o
// repository de consumo, e importá-las deste arquivo arrastaria o SDK do
// provedor para dentro de um teste que não toca em rede.
export { COTA_MENSAL_DESCRICAO, COTA_MINUTO_DESCRICAO } from '~~/shared/models/ai-generation'

export interface GeracaoIA {
  texto: string
  inputTokens: number
  outputTokens: number
  model: string
}

interface RespostaIA {
  content: { type: string; text?: string }[]
  usage: { input_tokens: number; output_tokens: number }
  model: string
}

/** O mínimo do SDK que usamos. Tipo próprio para o teste poder fingir. */
export interface ClienteIA {
  messages: { create(params: Record<string, unknown>): Promise<RespostaIA> }
}

let _client: ClienteIA | null = null

export function anthropicClient(): ClienteIA {
  if (_client) return _client
  const config = useRuntimeConfig()
  const apiKey = config.anthropicApiKey
  if (!apiKey) {
    // Mesmo formato de `serviceSupabase()`: sem este grito, o sintoma que chega
    // é "o botão parou", sem causa aparente em lugar nenhum.
    logError('config.anthropic_key_missing', {})
    throw createError({
      statusCode: 500,
      statusMessage: 'IA não configurada (NUXT_ANTHROPIC_API_KEY ausente).',
    })
  }
  _client = new Anthropic({ apiKey }) as unknown as ClienteIA
  return _client
}

export async function gerarTexto(
  client: ClienteIA,
  opts: { system: string; prompt: string; imagemUrl?: string | null; maxTokens?: number },
): Promise<GeracaoIA> {
  const config = useRuntimeConfig()
  const conteudo: Record<string, unknown>[] = []
  // A imagem vem ANTES do texto: é a ordem que a documentação do provedor
  // recomenda, e trocar degrada a resposta sem dar erro.
  if (opts.imagemUrl) {
    conteudo.push({ type: 'image', source: { type: 'url', url: opts.imagemUrl } })
  }
  conteudo.push({ type: 'text', text: opts.prompt })

  let resposta: RespostaIA
  try {
    resposta = await client.messages.create({
      model: config.aiModel,
      // Sem `thinking`: copy curta não melhora com raciocínio estendido, e ele
      // custa latência e tokens de SAÍDA, que é o lado caro.
      max_tokens: opts.maxTokens ?? 600,
      system: opts.system,
      messages: [{ role: 'user', content: conteudo }],
    })
  } catch (e) {
    throw traduzirErro(e)
  }

  const texto = resposta.content.find((b) => b.type === 'text')?.text?.trim()
  if (!texto) {
    // Devolver string vazia deixaria o corretor com o textarea limpo e nenhuma
    // explicação — e ainda assim teria consumido cota.
    logError('ia.resposta_sem_texto', { model: resposta.model })
    throw createError({ statusCode: 502, statusMessage: 'Não foi possível gerar agora.' })
  }

  return {
    texto,
    inputTokens: resposta.usage.input_tokens,
    outputTokens: resposta.usage.output_tokens,
    model: resposta.model,
  }
}

/**
 * Erro do provedor -> status nosso.
 *
 * A mensagem original NUNCA sai daqui: ela vaza nome de modelo, limite de conta
 * e, em alguns erros de validação, o começo do prompt.
 */
function traduzirErro(e: unknown) {
  const status = (e as { status?: number })?.status
  if (status === 429) {
    logWarn('ia.rate_limit', { reason: errMessage(e) })
    return createError({
      statusCode: 429,
      statusMessage: 'Serviço de IA ocupado. Tente em instantes.',
    })
  }
  if (status === 401 || status === 403) {
    // Chave errada mata o recurso para TODOS os clientes que pagam, de uma vez.
    logError('ia.auth_falhou', { reason: errMessage(e) })
    return createError({ statusCode: 500, statusMessage: 'IA indisponível.' })
  }
  logError('ia.chamada_falhou', { status, reason: errMessage(e) })
  return createError({ statusCode: 502, statusMessage: 'Não foi possível gerar agora.' })
}
