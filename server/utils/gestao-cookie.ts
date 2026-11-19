import type { H3Event } from 'h3'

/**
 * Cookie do refresh token do painel.
 *
 * Por que cookie e não localStorage: o token em memória sumia no F5 (o usuário
 * caía no login), mas guardá-lo em localStorage deixaria qualquer script na
 * página (XSS, extensão) ler o painel inteiro. `HttpOnly` não é legível pelo
 * JavaScript, então o ganho de "continuar logado" não reabre esse risco.
 *
 * O refresh token NUNCA vai para o navegador como dado: só o servidor o troca
 * (`/auth/renovar`). Se o client do Supabase no navegador renovasse por conta
 * própria, o token rotacionaria e a cópia do cookie ficaria inválida.
 *
 * `path` restrito a `/api/gestao/auth`: o cookie não viaja nas demais chamadas.
 * `SameSite=Strict` barra o envio em requisição de outro site (CSRF) — e as
 * chamadas autenticadas ainda exigem o Bearer, que o cookie não substitui.
 *
 * 8 h é o prazo de inatividade: cada renovação reemite o cookie (janela
 * deslizante). Sem renovar por 8 h, o cookie expira e pede login de novo.
 */
export const COOKIE_REFRESH_GESTAO = 'gestao_rt'
export const INATIVIDADE_GESTAO_S = 8 * 60 * 60

const base = (event: H3Event) => ({
  httpOnly: true,
  // Em http local (dev) o Secure faria o navegador descartar o cookie.
  secure: getRequestProtocol(event) === 'https',
  sameSite: 'strict' as const,
  path: '/api/gestao/auth',
})

export const gravarRefreshGestao = (event: H3Event, token: string) =>
  setCookie(event, COOKIE_REFRESH_GESTAO, token, { ...base(event), maxAge: INATIVIDADE_GESTAO_S })

export const lerRefreshGestao = (event: H3Event): string | null => getCookie(event, COOKIE_REFRESH_GESTAO) || null

export const limparRefreshGestao = (event: H3Event) => deleteCookie(event, COOKIE_REFRESH_GESTAO, base(event))
