/**
 * Protege as rotas da Área do Cliente.
 *
 * Espelha `middleware/admin.ts`, com as mesmas duas checagens e pelo mesmo
 * motivo: sessão válida no client, e a conta é cliente ATIVO do tenant DESTE
 * host. A segunda não é redundante — o portal fala com o Supabase direto (o
 * download de documento passa pelo servidor, mas a sessão não), e sem ela o
 * cliente de outra imobiliária abriria a tela e só descobriria a falta de
 * acesso quando o RLS devolvesse lista vazia. Lista vazia parece bug, não
 * parece falta de permissão.
 *
 * O parâmetro `?erro=` existe para a tela de login dizer o que houve. Um
 * "entre novamente" depois de uma senha que estava certa é o tipo de mensagem
 * que faz a pessoa ligar para a imobiliária.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { user, init, signOut } = usePortalAuth()
  if (user.value === null) await init()
  if (!user.value) return navigateTo('/area-cliente/login')

  const tenant = useTenant()
  if (!tenant.value) return

  const negado = await portalAccessDenial(tenant.value.id)
  if (!negado) return

  // A sessão é de outra porta (ou foi desligada): limpa antes de mandar ao
  // login, senão a tela recarrega com o token morto ainda no localStorage.
  await signOut()
  return navigateTo(`/area-cliente/login?erro=${negado}`)
})
