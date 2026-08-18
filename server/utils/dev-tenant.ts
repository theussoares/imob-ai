/** Nome do cookie que fixa o tenant escolhido por `?tenant=` fora de produção. */
export const DEV_TENANT_COOKIE = 'dev_tenant'

/**
 * Devolve o cabeçalho `Cookie` da requisição com o tenant de desenvolvimento
 * aplicado, substituindo um valor anterior em vez de duplicá-lo.
 *
 * Existe porque `setCookie` só escreve na RESPOSTA. O `app.vue` busca
 * `/api/tenant` por `requestFetch`, que repassa os cabeçalhos de ENTRADA — e na
 * primeira visita com `?tenant=` esse cabeçalho ainda não tem o cookie. O
 * resultado era a primeira carga renderizar a landing da plataforma e só a
 * segunda mostrar o tenant certo.
 *
 * Os demais cookies são preservados: a sessão do painel viaja neste cabeçalho, e
 * reescrevê-lo por inteiro deslogaria quem trocasse de tenant.
 */
export function withDevTenantCookie(existing: string | undefined, slug: string): string {
  const outros = (existing || '')
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    // Comparação pelo nome exato: `meu_dev_tenant` não é o nosso cookie.
    .filter((c) => c.split('=')[0]?.trim() !== DEV_TENANT_COOKIE)

  return [...outros, `${DEV_TENANT_COOKIE}=${slug}`].join('; ')
}
