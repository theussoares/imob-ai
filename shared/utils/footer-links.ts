export interface FooterLink {
  label: string
  href: string
}

/** Rodapé é sitewide: sem teto, uma lista longa polui todas as páginas. */
export const FOOTER_LINKS_MAX = 8
const LABEL_MAX = 40

const SCHEMES_OK = ['http:', 'https:', 'mailto:', 'tel:']

/**
 * O endereço pode virar `href` no rodapé público?
 *
 * Isto é controle de segurança, não validação de formulário. O valor é digitado
 * no painel e renderizado em TODAS as páginas do site do cliente: um esquema
 * executável aqui (`javascript:`) roda no domínio da imobiliária, com a sessão
 * de quem estiver visitando.
 *
 * Aceita caminho interno (`/pagina`) e os quatro esquemas de navegação/contato.
 * Tudo mais é recusado — lista fechada, não lista de proibidos: esquema novo
 * inventado amanhã já nasce bloqueado.
 */
export function isSafeFooterHref(href: string): boolean {
  const raw = String(href ?? '')
  // Navegadores ignoram caracteres de controle ao resolver o esquema, então
  // `java\nscript:` executa. Uma checagem de prefixo sem remover isso passaria.
  const limpo = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!limpo) return false

  // `//evil.com` herda o protocolo: parece interno e sai do site.
  if (limpo.startsWith('//')) return false
  if (limpo.startsWith('/')) return true

  // Sem esquema e sem barra inicial resolveria relativo à página atual — o mesmo
  // link do rodapé levaria a lugares diferentes conforme onde a pessoa está.
  const esquema = limpo.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]
  if (!esquema) return false
  return SCHEMES_OK.includes(`${esquema.toLowerCase()}:`)
}

/**
 * Normaliza a lista vinda do banco (JSONB) ou do painel.
 *
 * Descarta o que não serve em vez de recusar a lista inteira: um link ruim no
 * meio não deve impedir a pessoa de salvar os outros sete.
 */
export function sanitizeFooterLinks(value: unknown): FooterLink[] {
  if (!Array.isArray(value)) return []
  const out: FooterLink[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { label, href } = item as { label?: unknown; href?: unknown }
    const rotulo = String(label ?? '')
      .trim()
      .slice(0, LABEL_MAX)
    const endereco = String(href ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
    // Sem rótulo o link vira um vazio clicável no rodapé.
    if (!rotulo || !isSafeFooterHref(endereco)) continue
    out.push({ label: rotulo, href: endereco })
    if (out.length === FOOTER_LINKS_MAX) break
  }
  return out
}
