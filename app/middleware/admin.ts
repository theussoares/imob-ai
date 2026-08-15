/**
 * Protege as rotas do painel. Duas checagens:
 *  1. sessão válida no client (o painel é SPA — a sessão vive no localStorage);
 *  2. o usuário é membro do tenant DESTE subdomínio.
 *
 * A segunda é essencial: o storage grava direto no Supabase (sem passar pelos
 * endpoints /api/admin/*, que já usam requireTenantMember). Sem ela, um admin de
 * outra imobiliária abria o painel e só descobria a falta de acesso quando o RLS
 * recusava a escrita — ex.: upload de logo estourando "row-level security policy".
 * Se não for membro, deslogamos (a sessão é de outro tenant) e mandamos ao login.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const { user, init, signOut } = useAdminAuth()
  if (user.value === null) await init()
  if (!user.value) {
    return navigateTo('/admin/login')
  }

  const tenant = useTenant()
  if (tenant.value && !(await isMemberOfTenant(tenant.value.id))) {
    await signOut()
    return navigateTo('/admin/login?erro=sem-acesso')
  }
})
