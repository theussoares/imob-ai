import { listContracts } from '~~/server/repositories/contract.repository'

/**
 * Lista os contratos do tenant para o painel.
 *
 * Pelo client do USUÁRIO, não por service role — o oposto de
 * `properties.get.ts`, e a diferença é a 0028: os campos internos do contrato
 * moram em `contract_internal`, uma tabela separada, em vez de colunas com
 * privilégio restrito dentro de `contracts`. Sem privilégio por coluna, o
 * `select('*')` do repositório não tropeça, e a RLS (`contracts_member_write` /
 * `contracts_read`) continua sendo quem decide o que sai — que é a barreira que
 * service role desligaria.
 */
export default defineEventHandler(async (event) => {
  const { client, tenant } = await requireTenantMember(event)
  return listContracts(client, tenant.id)
})
