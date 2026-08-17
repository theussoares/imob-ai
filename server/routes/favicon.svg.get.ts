import { getHostname, isPlatformRootHost, resolveTenantForHost } from '~~/server/utils/tenant'

/**
 * Favicon gerado por tenant: inicial do nome sobre a cor da marca.
 *
 * É rota (e não arquivo estático) porque o ícone precisa variar por host — mesmo
 * motivo do robots.txt e do sitemap.xml. Usar a logo cadastrada não serve: logo
 * de imobiliária é retangular e com texto, e a 16px vira borrão.
 *
 * O tenant é resolvido aqui dentro porque o middleware ignora tudo que começa
 * com /favicon (para não depender do banco nessas rotas).
 *
 * Quando existir campo próprio de favicon no painel, ele passa a ter prioridade
 * e isto continua como fallback.
 */

/** Escapa o que vai dentro do SVG — é XML, não HTML. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Primeira letra "de verdade" do nome (ignora espaços e pontuação). */
function initialOf(name: string): string {
  const match = name.match(/\p{L}|\p{N}/u)
  return (match?.[0] ?? '?').toUpperCase()
}

/** Só aceita cor hex, para não injetar conteúdo arbitrário no SVG. */
function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback
}

const DEFAULT_COLOR = '#0f3d38'

export default defineEventHandler(async (event) => {
  const hostname = getHostname(event)

  let letter = 'M' // domínio-raiz da plataforma (Moradi)
  let color = DEFAULT_COLOR

  if (!isPlatformRootHost(hostname)) {
    try {
      const tenant = await resolveTenantForHost(hostname)
      if (tenant) {
        letter = initialOf(tenant.name)
        color = safeColor(tenant.brandPrimary, DEFAULT_COLOR)
      }
    } catch {
      // Banco fora: devolve o ícone neutro em vez de estourar erro numa rota
      // que o navegador pede em toda página.
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeXml(letter)}">
  <rect width="64" height="64" rx="14" fill="${color}"/>
  <text x="32" y="33" dy=".35em" text-anchor="middle" fill="#fff"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="38" font-weight="700">${escapeXml(letter)}</text>
</svg>`

  setHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return svg
})
