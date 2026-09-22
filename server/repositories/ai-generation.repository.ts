import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { AiGenerationKind } from '~~/shared/models/ai-generation'
// Da fonte em shared/, não de server/utils/ai.ts: aquele arquivo reexporta as
// mesmas duas constantes, mas importar de lá arrastaria o SDK do provedor
// (@anthropic-ai/sdk) para dentro deste teste, que não toca em rede.
import { COTA_MENSAL_DESCRICAO, COTA_MINUTO_DESCRICAO } from '~~/shared/models/ai-generation'

type Client = SupabaseClient<Database>

/**
 * Reserva a vaga na cota ANTES de gastar com o provedor.
 *
 * Por que RPC e não duas queries daqui: contar e depois inserir não serializa
 * nada. Na Vercel cada requisição cai numa lambda diferente; N chamadas
 * concorrentes leem o mesmo contador e passam todas. O `pg_advisory_xact_lock`
 * dentro da função é o que fecha a janela.
 *
 * Devolve `null` quando a cota estourou, e LANÇA quando a checagem falhou.
 *
 * ⚠️ FALHA FECHADA — desvio deliberado de `assertSubmitRateLimit`
 * (`server/utils/rate-limit.ts`), que falha ABERTO. Aquele limite protege o
 * formulário público do cliente e erra para o lado de deixar passar: falso
 * bloqueio ali é só um reenvio. Este protege dinheiro — falhar aberto com o
 * banco instável significa freio desligado e conta sem teto, e falso passe
 * aqui não tem limite. Não "corrija" isto por consistência com o rate-limit;
 * é o teste "erro na reserva BLOQUEIA" que existe para pegar essa correção.
 */
export async function reservarGeracao(
  client: Client,
  opts: {
    tenantId: string
    createdBy: string
    propertyId: string | null
    kind: AiGenerationKind
    model: string
  },
): Promise<string | null> {
  const { data, error } = await client.rpc('reservar_geracao_ia', {
    p_tenant_id: opts.tenantId,
    p_created_by: opts.createdBy,
    p_property_id: opts.propertyId,
    p_kind: opts.kind,
    p_model: opts.model,
    p_cota_mes: COTA_MENSAL_DESCRICAO,
    p_cota_minuto: COTA_MINUTO_DESCRICAO,
  })

  if (error) {
    logError('ia.cota_indisponivel', { tenant: opts.tenantId, reason: error.message })
    throw createError({
      statusCode: 429,
      statusMessage: 'Não foi possível verificar o limite agora. Tente em instantes.',
    })
  }

  return (data as string | null) ?? null
}

export async function concluirGeracao(
  client: Client,
  id: string,
  dados: { inputTokens: number; outputTokens: number; model: string },
): Promise<void> {
  const { error } = await client
    .from('ai_generations')
    .update({
      status: 'concluida',
      input_tokens: dados.inputTokens,
      output_tokens: dados.outputTokens,
      model: dados.model,
    })
    .eq('id', id)
  if (error) throw error
}

/** Marca a reserva como perdida. Não lança: o chamador já está tratando um erro. */
export async function marcarFalha(client: Client, id: string): Promise<void> {
  const { error } = await client.from('ai_generations').update({ status: 'falhou' }).eq('id', id)
  if (error) logWarn('ia.marcar_falha_falhou', { id, reason: error.message })
}

/**
 * Quantas tentativas o tenant já fez no mês corrente — alimenta o saldo da tela.
 *
 * ⚠️ O recorte tem que ser o MESMO de `reservar_geracao_ia`, senão o saldo
 * mostrado discorda do limite aplicado na virada do mês e o cliente vê "restam
 * 40" enquanto recebe 429. O `3` abaixo é o início do mês em
 * America/Sao_Paulo expresso em UTC (UTC-3, sem horário de verão no Brasil
 * desde 2019) — e é por isso que ele não pode virar `0` num "conserto".
 */
export async function contarNoMes(client: Client, tenantId: string): Promise<number> {
  const agora = new Date()
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1, 3, 0, 0))
  const { count, error } = await client
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', inicio.toISOString())
  if (error) throw error
  return count ?? 0
}
