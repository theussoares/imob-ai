/**
 * Convenção da plataforma: `painel.<dominio-do-cliente>` serve exclusivamente o
 * admin. É prefixo em vez de configuração por tenant justamente pra que todo
 * cliente novo ganhe o painel no próprio domínio sem cadastro extra.
 *
 * Mora em `shared/` porque o navegador também precisa da regra: é ela que
 * decide se o service worker do PWA pode ser registrado. Uma cópia no cliente
 * ficaria livre para divergir da do servidor, e o efeito de divergir é grave
 * nos dois sentidos — SW registrado no site público de um cliente, ou painel
 * sem PWA nenhum.
 */
export const ADMIN_HOST_PREFIX = 'painel.'

export function isAdminHost(hostname: string): boolean {
  return hostname.startsWith(ADMIN_HOST_PREFIX)
}
