import { requireGestaoMember } from '~~/server/utils/gestao-auth'
import { listBrokerNames } from '~~/server/repositories/broker.repository'

/**
 * Corretores ativos da imobiliária (id + nome) para os seletores do painel. Sem isto o front em
 * modo `http` não tem como abrir contrato em nome de um corretor: o seed tem ids `c1…`, e o
 * servidor só aceita `brokers.id` do tenant. Qualquer membro lê (o corretor vê o próprio nome
 * no cabeçalho de todo processo); o tenant sai da sessão.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireGestaoMember(event)
  return { corretores: await listBrokerNames(ctx.db, ctx.tenant.id) }
})
