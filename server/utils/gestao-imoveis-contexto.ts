import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'
import { armazenarFotoImovel } from '~~/server/utils/gestao-fotos'
import { locacoesDoImovelGestao } from '~~/server/utils/gestao-imoveis-locacoes'
import type { ContextoImoveis } from '~~/server/utils/gestao-imoveis'

/**
 * Único ponto do cadastro de imóveis que depende da fundação da F1 (`requireGestaoMember`,
 * `registrarEvento`). Os endpoints chamam só esta função; o núcleo (`gestao-imoveis.ts`)
 * recebe o contexto pronto e não conhece a F1.
 *
 * O `id` da rota vem por `idDeRota` nos endpoints. O tenant sai do membro autenticado, nunca do corpo.
 */
export async function contextoImoveis(event: H3Event): Promise<ContextoImoveis> {
  const g = await requireGestaoMember(event)
  const db = g.db as SupabaseClient<Database>
  const tenant = { id: g.tenant.id, slug: g.tenant.slug }
  return {
    membro: { userId: g.membro.userId, nome: g.membro.nome, perfil: g.membro.perfil, brokerId: g.membro.brokerId },
    tenant,
    matriz: g.matriz,
    db,
    registrar: (acao, alvoId) =>
      registrarEvento(db, tenant.id, { atorUserId: g.membro.userId, atorNome: g.membro.nome, acao, alvoTipo: 'imovel', alvoId }),
    invalidarCache: () => invalidateTenantCache(tenant.id),
    armazenarFoto: (foto) => armazenarFotoImovel(db, tenant.slug, foto),
    locacoesDoImovel: (imovelId) => locacoesDoImovelGestao(db, tenant.id, imovelId),
  }
}
