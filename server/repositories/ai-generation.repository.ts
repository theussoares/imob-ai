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

/**
 * ⚠️ `tenantId` aqui é defesa em profundidade, não a barreira principal: hoje o
 * `id` sempre vem do `reservarGeracao` da própria requisição, que já reservou
 * dentro do tenant certo. Mas `serviceSupabase()` ignora RLS — não há banco
 * segurando nada — e um endpoint futuro que receba `id` de fonte menos
 * confiável (ex.: um job, ou um retry vindo de outro lugar) não teria nenhuma
 * barreira sem o filtro aqui. O custo é um parâmetro; o benefício é o mesmo
 * que `tenant.ts` documenta para toda query com service role.
 */
export async function concluirGeracao(
  client: Client,
  id: string,
  tenantId: string,
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
    .eq('tenant_id', tenantId)
  if (error) throw error
}

/** Marca a reserva como perdida. Não lança: o chamador já está tratando um erro. */
export async function marcarFalha(client: Client, id: string, tenantId: string): Promise<void> {
  const { error } = await client
    .from('ai_generations')
    .update({ status: 'falhou' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) logWarn('ia.marcar_falha_falhou', { id, reason: error.message })
}

/**
 * Quantas tentativas o tenant já fez no mês corrente, para este `kind` —
 * alimenta o saldo da tela.
 *
 * ⚠️ Este recorte tem que ser o MESMO de `reservar_geracao_ia`
 * (`supabase/migrations/0043_descricao_ia.sql`), senão o saldo mostrado
 * discorda do limite aplicado e o cliente vê "restam 40" enquanto recebe 429.
 * Duas armadilhas já pegaram esta função uma vez cada:
 *
 * 1. **Calendário, não offset.** O SQL faz
 *    `date_trunc('month', now() at time zone 'America/Sao_Paulo')` — ou seja,
 *    descobre EM QUE MÊS ESTAMOS olhando o relógio de SP, não o de UTC.
 *    `new Date().getUTCFullYear()/getUTCMonth()` lê o calendário UTC, que já
 *    pode ter virado o mês: nas três primeiras horas UTC de todo dia 1º
 *    (21h–23h59 do dia 31 em SP), o UTC diz "dia 1", o SQL diz "ainda mês
 *    anterior", e a diferença é um mês inteiro, não três horas. Por isso o
 *    ano/mês são extraídos de `agora` já DESLOCADO para SP (`sp` abaixo), e só
 *    depois recompostos em UTC com o offset fixo de nascença. Trocar a ordem
 *    — extrair ano/mês do `agora` cru e só então aplicar o offset — reintroduz
 *    o bug mesmo mantendo o número `3` certo.
 * 2. **`kind` filtra na RPC, não aqui (antes deste fix).** A RPC conta
 *    `where tenant_id = p_tenant_id and kind = p_kind`. Sem o mesmo filtro
 *    aqui, no dia em que outro `kind` nascer (ex.: `'titulo'`) o saldo exibido
 *    soma as duas cotas juntas, enquanto o limite aplicado é por `kind`.
 *
 * O `3` do horário: início do dia em America/Sao_Paulo expresso em UTC
 * (UTC-3, sem horário de verão no Brasil desde 2019) — não pode virar `0`.
 */
export async function contarNoMes(client: Client, tenantId: string, kind: AiGenerationKind): Promise<number> {
  const agora = new Date()
  // Desloca PRIMEIRO para o relógio de SP, e só então lê ano/mês dele — é a
  // ordem que faz a virada de mês coincidir com a do SQL.
  const sp = new Date(agora.getTime() - 3 * 3600 * 1000)
  const inicio = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3, 0, 0))
  const { count, error } = await client
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .gte('created_at', inicio.toISOString())
  if (error) throw error
  return count ?? 0
}
