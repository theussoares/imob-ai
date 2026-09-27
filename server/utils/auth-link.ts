/**
 * Link de convite/recuperação que sobrevive à prévia do WhatsApp.
 *
 * O `action_link` do Supabase (`/auth/v1/verify?token=…`) é de uso único e é
 * GASTO por um simples GET. Quem abre primeiro leva: a prévia que o WhatsApp
 * monta ao colar o link, o antivírus do e-mail corporativo, o robô que confere
 * links. Em 27/09 um convite do painel colado no WhatsApp chegou morto — a
 * prévia verificou o token às 13:00:54 e o clique de verdade, 21 s depois, deu
 * "One-time token not found" (BUG-FUN-03). E o fluxo do painel MANDA colar no
 * WhatsApp.
 *
 * A saída é o link apontar para a NOSSA página, com o `hashed_token` na URL, e
 * a verificação (`verifyOtp`) acontecer só quando a pessoa clica em
 * "Continuar". Prévia e antivírus carregam a página e não gastam nada.
 *
 * `redirectTo` é a tela de definir senha já com a origem certa (o chamador a
 * resolve: do banco no portal, do request autenticado no painel).
 *
 * Sem `hashed_token` (o GoTrue mudou de formato, por exemplo), cai no
 * `action_link` antigo: pior contra a prévia, mas o convite ainda sai — melhor
 * que convite nenhum.
 */
export function linkDeAcesso(
  redirectTo: string,
  props: { hashed_token?: string | null; verification_type?: string | null; action_link?: string | null } | null | undefined,
): string | null {
  if (props?.hashed_token && props.verification_type) {
    const url = new URL(redirectTo)
    url.searchParams.set('token_hash', props.hashed_token)
    url.searchParams.set('type', props.verification_type)
    return url.toString()
  }
  return props?.action_link ?? null
}
