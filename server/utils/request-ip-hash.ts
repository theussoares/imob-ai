import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'

/**
 * Hash do IP para o anti-flood, sem guardar o IP puro.
 *
 * Compartilhado pelo formulário de lead e pelo registro de clique no WhatsApp:
 * os dois precisam do MESMO pseudônimo, com o mesmo sal, para que uma mudança
 * de regra valha para os dois.
 *
 * Devolve `null` — e a trava por IP simplesmente não roda — em dois casos:
 *
 *  - sem header de plataforma, porque identificar errado é pior que não
 *    identificar (ver `clientIpFrom`);
 *  - sem `RATE_LIMIT_IP_SALT`. Sem sal isto seria `sha256(ip)`, e o espaço IPv4
 *    inteiro tem 2^32 endereços: a tabela completa se computa em minutos, então
 *    o hash não esconderia nada de quem lesse a tabela. Guardar um pseudônimo
 *    reversível é pior que não guardar — some a proteção E fica o dado.
 */
export function requestIpHash(event: H3Event): string | null {
  const ip = clientIpFrom((name) => getHeader(event, name))
  if (!ip) return null

  const salt = segredoDeRuntime(useRuntimeConfig().rateLimitIpSalt, 'RATE_LIMIT_IP_SALT')
  if (!salt) {
    // Precisa gritar: sem isto a segunda trava fica desligada em silêncio.
    logWarn('ratelimit.ip_salt_missing', {})
    return null
  }

  return createHash('sha256').update(`${salt}:${rateLimitIpKey(ip)}`).digest('hex')
}
