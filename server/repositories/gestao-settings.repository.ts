import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '~~/shared/types/database.types'
import type { MatrizPermissoes } from '~~/layers/gestao/domain/types'
import type { ConfiguracoesGestao } from '~~/layers/gestao/domain/configuracoes'
import { configDoBanco, matrizDoBanco } from '~~/server/mappers/gestao-settings.mapper'

type Client = SupabaseClient<Database>

/**
 * Matriz de permissões e configurações do painel, por tenant (`gestao_settings`).
 *
 * ⚠️ Erro de leitura LANÇA, não cai no padrão. A matriz salva pode ser mais
 * restrita que a padrão (a imobiliária tirou `valores` do Jurídico, por exemplo);
 * cair no padrão numa falha devolveria em silêncio o acesso que ela tirou.
 * Linha ausente é outra coisa: imobiliária que nunca mexeu usa o padrão.
 */
export async function lerSettings(
  db: Client,
  tenantId: string,
  /** nome do tenant: vira o nome da imobiliária enquanto a config nunca foi salva */
  nomeTenant?: string,
): Promise<{ matriz: MatrizPermissoes; config: ConfiguracoesGestao }> {
  const { data, error } = await db
    .from('gestao_settings')
    .select('matriz, config')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    logError('gestao.settings_leitura_falhou', { tenant: tenantId, reason: errMessage(error) })
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar as permissões.' })
  }
  return { matriz: matrizDoBanco(data?.matriz), config: configDoBanco(data?.config, nomeTenant) }
}

/** Upsert só da coluna `matriz`: o merge do PostgREST não toca `config` na linha existente. */
export async function gravarMatriz(db: Client, tenantId: string, matriz: MatrizPermissoes): Promise<void> {
  const { error } = await db
    .from('gestao_settings')
    .upsert({ tenant_id: tenantId, matriz: matriz as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
  if (error) throw error
}

export async function gravarConfig(db: Client, tenantId: string, config: ConfiguracoesGestao): Promise<void> {
  const { error } = await db
    .from('gestao_settings')
    .upsert({ tenant_id: tenantId, config: config as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
  if (error) throw error
}
