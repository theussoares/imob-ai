import type { Tenant } from '~~/shared/models/tenant'
import { getPrimaryDomain } from '~~/server/repositories/tenant.repository'

/**
 * A origem pública do portal deste tenant — o endereço para onde os links de
 * convite e de recuperação de senha apontam.
 *
 * ⚠️ **Por que não usar `getRequestURL(event).origin`.**
 *
 * Aquele valor vem de `Host`/`X-Forwarded-Host`, que é dado do cliente. Como o
 * link gerado carrega um token de sessão (`?code=`), um `X-Forwarded-Host`
 * forjado numa chamada ao endpoint público de recuperação faria o e-mail da
 * vítima chegar com um link apontando para o servidor de quem forjou — e quem
 * clicasse entregaria o token. A allowlist de Redirect URLs do Supabase hoje
 * barra isso, mas é configuração fora deste repositório: não dá para depender
 * dela silenciosamente.
 *
 * Aqui a origem sai do BANCO: o domínio primário do tenant, ou o subdomínio da
 * plataforma quando ele ainda não tem domínio próprio. Nenhum dos dois é
 * influenciável por header.
 */
export async function portalOrigin(client: ReturnType<typeof serviceSupabase>, tenant: Tenant): Promise<string> {
  const primario = await getPrimaryDomain(client, tenant.id)
  if (primario) return `https://${primario}`

  // Sem domínio próprio, o endereço é `<slug>.<plataforma>` — a mesma
  // convenção que `resolveTenantForHost` usa para achar o tenant pelo
  // subdomínio.
  const plataforma = (useRuntimeConfig().platformDomain || '').toLowerCase()
  if (plataforma) return `https://${tenant.slug}.${plataforma}`

  // Sem `platformDomain` configurado não há endereço público a afirmar. Em vez
  // de inventar um, falha alto: link de convite para o host errado é pior que
  // convite que não sai, porque o cliente clica e não entende o que aconteceu.
  logError('portal.origem_indefinida', { tenant: tenant.slug })
  throw createError({
    statusCode: 500,
    statusMessage: 'Endereço público da imobiliária não configurado.',
  })
}

/** Destino do link de definir senha. */
export function urlDefinirSenha(origem: string): string {
  return `${origem}/area-cliente/definir-senha`
}

/** Endereço do login do portal, para o aviso sem token. */
export function urlLoginPortal(origem: string): string {
  return `${origem}/area-cliente/login`
}
