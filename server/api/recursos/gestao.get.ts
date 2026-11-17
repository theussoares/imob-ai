import { gestaoAtiva } from '~~/server/utils/entitlement'

/**
 * O painel de Gestão está ligado para a imobiliária deste domínio?
 *
 * Público de propósito: /gestao tem sessão própria (demo) e não passa pelo
 * Supabase Auth, então não há "membro" a quem perguntar. O que sai daqui é só
 * um booleano que o próprio 404 já revelaria; nada de plano, carência ou data.
 *
 * Fica fora de `/api/gestao`: esse prefixo é do mocker-nuxt no `dev:gestao`.
 * Não é cacheado no edge: a resolução do tenant já tem TTL de 60s, e o
 * interruptor tem que valer na hora em que o suporte liga.
 */
export default defineEventHandler(async (event) => {
  const tenant = useTenantContext(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return { ativo: await gestaoAtiva(tenant.id) }
})
