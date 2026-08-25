/**
 * Identificação do cliente para rate limit de formulário público.
 *
 * Regra de ouro: só vale header que a PLATAFORMA escreve. Qualquer header que o
 * cliente consiga mandar é, na prática, um botão de "me dê um balde novo" — e um
 * rate limit que o abusador escolhe não limita nada.
 */

/**
 * Ordem de confiança. `cf-connecting-ip` NÃO está aqui de propósito: o deploy é
 * Vercel (`preset: 'vercel'`), sem Cloudflare na frente, então nada no caminho
 * escreve ou remove esse header — ele chega exatamente como o cliente mandou.
 * Só volte a considerá-lo se houver Cloudflare de verdade na frente E a origem
 * da requisição for validada contra as faixas de IP da CF.
 */
const PLATFORM_IP_HEADERS = ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']

/**
 * IP do cliente, ou `null` quando não dá para saber.
 *
 * Sem fallback para o socket: em serverless ele é o proxy, então devolveria o
 * MESMO endereço para todo mundo — e um limite por IP compartilhado bloquearia
 * visitantes legítimos em vez de abusadores. Não identificar é melhor que
 * identificar errado: quem não tem IP simplesmente não passa por essa trava.
 */
export function clientIpFrom(readHeader: (name: string) => string | null | undefined): string | null {
  for (const name of PLATFORM_IP_HEADERS) {
    const raw = readHeader(name)
    if (!raw) continue
    // Numa cadeia de proxies, a primeira entrada é o cliente original.
    const first = String(raw).split(',')[0]?.trim()
    if (first) return first
  }
  return null
}

/** Tira colchetes, porta e zona (`%eth0`), e baixa a caixa. */
function cleanup(ip: string): string {
  let out = ip.trim().toLowerCase()
  const bracket = out.match(/^\[(.+)\](?::\d+)?$/)
  if (bracket?.[1]) out = bracket[1]
  const zone = out.indexOf('%')
  if (zone !== -1) out = out.slice(0, zone)
  return out
}

/** Expande um IPv6 para os 8 grupos, já sem zeros à esquerda. `null` se malformado. */
function expandIpv6(ip: string): string[] | null {
  const partes = ip.split('::')
  if (partes.length > 2) return null

  const head = partes[0] ? partes[0].split(':') : []
  const tail = partes.length === 2 && partes[1] ? partes[1].split(':') : []
  if (head.length + tail.length > 8) return null

  const grupos =
    partes.length === 2
      ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
      : head
  if (grupos.length !== 8) return null

  const normalizados: string[] = []
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    normalizados.push(parseInt(g, 16).toString(16))
  }
  return normalizados
}

/**
 * Chave de contagem a partir do IP.
 *
 * IPv4 conta por endereço. IPv6 conta pelo bloco /64, porque o assinante recebe
 * um bloco inteiro: são 2^64 endereços que a mesma pessoa usa à vontade, sem
 * forjar nada. Contar por endereço cheio faria o limite não valer absolutamente
 * nada em IPv6.
 */
export function rateLimitIpKey(ip: string): string {
  const limpo = cleanup(ip)

  // ::ffff:1.2.3.4 é um IPv4 vestido de IPv6 — conta como o IPv4 que ele é.
  const mapeado = limpo.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mapeado?.[1]) return mapeado[1]

  if (!limpo.includes(':')) return limpo

  const grupos = expandIpv6(limpo)
  // Malformado: devolve o que veio em vez de agrupar errado. Pior caso, o
  // abusador ganha um balde só para ele — nunca o balde de outra pessoa.
  if (!grupos) return limpo
  return grupos.slice(0, 4).join(':')
}
