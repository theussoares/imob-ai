/**
 * O que pode sair para o Vercel Analytics e o Speed Insights — e o que não.
 *
 * Os dois recebem a URL de cada visita. Sem filtro, estavam recebendo também:
 *
 * - **o painel** (`painel.<domínio>` e `/admin`): uso interno da imobiliária,
 *   que não é visita de cliente e só distorce as métricas do site;
 * - **a Área do Cliente** (`/area-cliente/...`): a URL carrega o id do contrato
 *   de uma pessoa real, e a de redefinir senha, o token. É dado de cliente final
 *   indo para um terceiro sem necessidade — o contrário do que o runbook de
 *   LGPD (0037) promete.
 *
 * Nas demais, a query sai inteira, exceto `utm_*`: filtros de busca não dizem
 * nada que a rota já não diga, e query é onde dado pessoal costuma vazar
 * (e-mail em link de campanha, telefone colado na busca). O `#` sai sempre.
 *
 * Devolve a URL limpa, ou `null` para descartar o evento.
 */
export const PREFIXOS_PRIVADOS = ['/admin', '/area-cliente'] as const

export function urlRastreavel(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.hostname.startsWith('painel.')) return null
  if (PREFIXOS_PRIVADOS.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))) return null

  const utm = [...u.searchParams].filter(([k]) => k.startsWith('utm_'))
  u.search = ''
  for (const [k, v] of utm) u.searchParams.append(k, v)
  u.hash = ''
  return u.toString()
}

/** `beforeSend` para os dois pacotes: mesma regra, formato de evento de cada um. */
export function filtrarEvento<T extends { url: string }>(evento: T): T | null {
  const url = urlRastreavel(evento.url)
  return url ? { ...evento, url } : null
}
