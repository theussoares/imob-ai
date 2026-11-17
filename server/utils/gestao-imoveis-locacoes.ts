import type { SupabaseClient } from '@supabase/supabase-js'
import type { Locacao } from '~~/layers/gestao/domain/types'

/**
 * Locações do imóvel, para a regra «não excluir imóvel com locação em andamento»
 * (`podeExcluirImovel`). Regra plugável: o núcleo de imóveis recebe esta função pelo
 * contexto, então trocá-la não mexe nele.
 *
 * TODO(F4): ler `gestao_locacoes` (migration 0062, `imovel_id` + `status` + `arquivado`,
 * sempre com `.eq('tenant_id', tenantId)`). Até lá devolve vazio — o que significa que
 * hoje o servidor NÃO bloqueia a exclusão de imóvel com locação; só a F4 fecha isso.
 * Sem a tabela não há o que consultar, e consultar uma tabela inexistente derrubaria
 * toda exclusão com 500.
 */
export async function locacoesDoImovelGestao(_db: SupabaseClient, _tenantId: string, _imovelId: string): Promise<Locacao[]> {
  return []
}
