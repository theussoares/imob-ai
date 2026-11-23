import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatusVenda } from '~~/layers/gestao/domain/types'

/**
 * Contratos ATIVOS do tenant inteiro, só com o que decide a situação de um imóvel (`situacaoPorContratos`):
 * o imóvel de cada locação ativa e o imóvel + status de cada venda não arquivada. Duas colunas por linha, nunca
 * o `jsonb` do contrato: a lista de imóveis precisa disto para cada página e não pode carregar contratos inteiros.
 *
 * É do tenant, e não do corretor: o imóvel é de todos, então estar em locação de OUTRO corretor também o tira de
 * «disponível». Blocos de 1000 (o PostgREST corta ali) até o teto; `truncado` avisa que passou dele.
 */
const BLOCO = 1000
export const LIMITE_VARREDURA_CONTRATOS = 5000

type Bloco = PromiseLike<{ data: unknown[] | null; error: unknown }>

async function varrer<T>(bloco: (de: number, ate: number) => Bloco): Promise<{ linhas: T[]; truncado: boolean }> {
  const linhas: T[] = []
  for (let de = 0; de < LIMITE_VARREDURA_CONTRATOS; de += BLOCO) {
    const { data, error } = await bloco(de, de + BLOCO - 1)
    if (error) throw error
    const lote = (data ?? []) as T[]
    linhas.push(...lote)
    if (lote.length < BLOCO) return { linhas, truncado: false }
  }
  return { linhas, truncado: true }
}

export interface ContratosAtivosDosImoveis {
  /** Ids de imóvel com locação que não foi encerrada nem arquivada. */
  emLocacao: Set<string>
  /** Status das vendas não arquivadas de cada imóvel (venda sem `imovelId`, antiga, não entra). */
  vendas: Map<string, StatusVenda[]>
  truncado: boolean
}

export async function contratosAtivosDosImoveis(db: SupabaseClient, tenantId: string): Promise<ContratosAtivosDosImoveis> {
  const [locacoes, vendas] = await Promise.all([
    varrer<{ imovel_id: string | null }>((de, ate) =>
      db.from('gestao_locacoes').select('imovel_id').eq('tenant_id', tenantId).eq('arquivado', false).neq('status', 'Encerrada').order('id').range(de, ate),
    ),
    varrer<{ status: StatusVenda; imovel_id: string | null }>((de, ate) =>
      db.from('gestao_vendas').select('status, imovel_id:dados->>imovelId').eq('tenant_id', tenantId).eq('arquivado', false).order('id').range(de, ate),
    ),
  ])
  const porImovel = new Map<string, StatusVenda[]>()
  for (const v of vendas.linhas) {
    if (!v.imovel_id) continue
    porImovel.set(v.imovel_id, [...(porImovel.get(v.imovel_id) ?? []), v.status])
  }
  return {
    emLocacao: new Set(locacoes.linhas.map((l) => l.imovel_id).filter((x): x is string => !!x)),
    vendas: porImovel,
    truncado: locacoes.truncado || vendas.truncado,
  }
}
