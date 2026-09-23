import { getAiTone } from '~~/server/repositories/tenant.repository'

/**
 * Tom da descrição por IA configurado para esta imobiliária.
 *
 * Endpoint próprio, fora de `/api/admin/tenant` (que devolve o modelo `Tenant`
 * inteiro): o tom não é campo de `Tenant`/`toTenantModel` de propósito — ver o
 * comentário de `getAiTone` em `server/repositories/tenant.repository.ts`.
 *
 * Sem checagem de entitlement aqui: ler o tom já configurado não custa nada, e
 * a tela que MOSTRA este widget é quem decide se oferece a seção (via
 * `useAdminFeatures().descricaoIa`, checado no cliente e não repetido aqui).
 */
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantMember(event)
  return { aiTone: await getAiTone(serviceSupabase(), tenant.id) }
})
