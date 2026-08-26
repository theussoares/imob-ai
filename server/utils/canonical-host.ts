/**
 * Um site, um endereço.
 *
 * Quando uma imobiliária ganha domínio próprio, o subdomínio antigo da
 * plataforma continua servindo o mesmo site — e o Google passa a ver dois sites
 * completos com conteúdo idêntico, dividindo entre eles os links e a reputação
 * que deveriam se somar num só. O mesmo vale para www e apex.
 *
 * A coluna `is_primary` de `tenant_domains` existe desde a 0001 para marcar qual
 * é o endereço oficial, mas nenhum código a lia. É ela que decide aqui.
 *
 * Só a decisão mora nesta função; os guardas de ambiente e de rota de painel
 * ficam no middleware, que é onde há acesso ao evento.
 */

/** Tira a porta e baixa a caixa — a comparação é entre nomes de host. */
function normalize(host: string): string {
  return host.trim().toLowerCase().split(":")[0] || ""
}

/**
 * Para qual host redirecionar, ou `null` quando já se está no canônico.
 *
 * Devolver `null` quando não há primário é o que mantém funcionando o tenant que
 * ainda não tem domínio próprio: ele continua atendendo no subdomínio da
 * plataforma, sem redirect nenhum.
 */
/** O domínio sem o "www." da frente, para comparar apex e www como o mesmo site. */
function semWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host
}

export function canonicalHostFor(host: string, primaryDomain: string | null | undefined): string | null {
  const primary = normalize(primaryDomain || "")
  if (!primary) return null

  const atual = normalize(host)

  // Sem esta comparação o redirect apontaria para si mesmo e entraria em laço.
  if (atual === primary) return null

  /**
   * Diferença só no "www." não vira redirect — em nenhuma direção.
   *
   * A hospedagem já resolve apex contra www (na Vercel, o apex está configurado
   * para redirecionar ao www). Se o banco disser que o primário é o apex, este
   * middleware mandaria www -> apex, a hospedagem mandaria apex -> www, e o site
   * cairia com "too many redirects" — nos dois clientes que têm domínio próprio.
   *
   * O trabalho daqui é outro: levar o subdomínio ANTIGO da plataforma para o
   * domínio próprio. Deixando apex/www para a hospedagem, um `is_primary`
   * apontando para o lado errado degrada para "não consolida", nunca para "fora
   * do ar".
   */
  if (semWww(atual) === semWww(primary)) return null

  return primary
}
