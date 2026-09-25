import { descricaoIaAtiva } from '~~/server/utils/entitlement'
import { contarNoMes } from '~~/server/repositories/ai-generation.repository'
import { saldoMensalDescricao } from '~~/shared/models/ai-generation'

/**
 * Quantas descrições por IA ainda restam neste mês.
 *
 * O saldo só vinha na RESPOSTA da geração, então o painel só mostrava "restam
 * N" depois do primeiro clique — quem estava com 2 gerações sobrando
 * descobria no erro 429. Saber antes muda o cuidado com as dicas.
 *
 * Mesma guarda de entitlement do POST de geração: sem o recurso contratado, o
 * painel nem mostra o bloco, e a contagem não é assunto dessa imobiliária.
 * Só leitura, tenant do contexto, nunca do request.
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  if (!(await descricaoIaAtiva(tenant.id))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'A descrição por IA não está contratada para esta imobiliária.',
    })
  }
  const usadas = await contarNoMes(serviceSupabase(), tenant.id, 'descricao')
  return saldoMensalDescricao(usadas)
})
