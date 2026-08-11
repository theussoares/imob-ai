import type { Tenant } from '~~/shared/models/tenant'
import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function priceLabel(p: Property): string {
  return brl(p.price) + (p.purpose === 'aluguel' ? '/mês' : '')
}

function specsLine(p: Property): string {
  if (p.type === 'terreno') return `${p.area} m² de área`
  return `${p.bedrooms} quartos · ${p.bathrooms} banheiros · ${p.parking} vagas · ${p.area} m²`
}

function contactBlock(t: Tenant): string {
  const parts: string[] = []
  if (t.whatsapp) parts.push(`WhatsApp: ${t.whatsapp}`)
  if (t.phone) parts.push(`Telefone: ${t.phone}`)
  if (t.email) parts.push(`E-mail: ${t.email}`)
  const local = [t.city, t.state].filter(Boolean).join('/')
  if (local) parts.push(`Local: ${local}`)
  if (t.creci) parts.push(`CRECI: ${t.creci}`)
  return parts.join(' · ')
}

/** Markdown do catálogo completo (home) para consumo por agentes/IA. */
export function tenantCatalogMarkdown(tenant: Tenant, properties: Property[], origin: string): string {
  const lines: string[] = []
  lines.push(`# ${tenant.name}`)
  if (tenant.tagline) lines.push(`\n_${tenant.tagline}_`)
  if (tenant.heroSubtitle) lines.push(`\n${tenant.heroSubtitle}`)
  const contact = contactBlock(tenant)
  if (contact) lines.push(`\n**Contato:** ${contact}`)

  const venda = properties.filter((p) => p.purpose === 'venda')
  const aluguel = properties.filter((p) => p.purpose === 'aluguel')

  const section = (title: string, list: Property[]) => {
    if (!list.length) return
    lines.push(`\n## ${title} (${list.length})`)
    for (const p of list) {
      lines.push(`\n### ${p.title} — ${priceLabel(p)}`)
      lines.push(`- Código: ${p.code}`)
      lines.push(`- Tipo: ${PROPERTY_TYPE_LABELS[p.type]}`)
      const loc = [p.neighborhood, p.city, p.state].filter(Boolean).join(', ')
      if (loc) lines.push(`- Localização: ${loc}`)
      lines.push(`- Características: ${specsLine(p)}`)
      if (p.highStandard) lines.push(`- Alto padrão`)
      if (p.features.length) lines.push(`- Diferenciais: ${p.features.join(', ')}`)
      if (p.description) lines.push(`- ${p.description}`)
      lines.push(`- Página: ${origin}/imovel/${encodeURIComponent(p.code)}`)
    }
  }

  section('Imóveis à venda', venda)
  section('Imóveis para alugar', aluguel)

  if (!properties.length) lines.push('\n_Nenhum imóvel publicado no momento._')
  return lines.join('\n') + '\n'
}

/** /llms.txt (llmstxt.org): índice em Markdown do site para LLMs. */
export function buildLlmsTxt(tenant: Tenant, properties: Property[], origin: string): string {
  const lines: string[] = []
  lines.push(`# ${tenant.name}`)
  const summary = tenant.heroSubtitle || tenant.tagline
  if (summary) lines.push(`\n> ${summary}`)

  const local = [tenant.city, tenant.state].filter(Boolean).join('/')
  lines.push(
    `\nImobiliária/corretor de imóveis${local ? ` em ${local}` : ''} — compra, venda e locação. ` +
      `Este arquivo lista os imóveis disponíveis e os recursos do site.`,
  )
  const contact = contactBlock(tenant)
  if (contact) lines.push(`\n**Contato:** ${contact}`)

  const venda = properties.filter((p) => p.purpose === 'venda')
  const aluguel = properties.filter((p) => p.purpose === 'aluguel')

  const section = (title: string, list: Property[]) => {
    if (!list.length) return
    lines.push(`\n## ${title}`)
    for (const p of list) {
      const loc = [p.neighborhood, p.city].filter(Boolean).join(', ')
      lines.push(
        `- [${p.title} — ${priceLabel(p)}](${origin}/imovel/${encodeURIComponent(p.code)}): ` +
          `${PROPERTY_TYPE_LABELS[p.type]}${loc ? ` em ${loc}` : ''}. ${specsLine(p)}.`,
      )
    }
  }
  section('Imóveis à venda', venda)
  section('Imóveis para alugar', aluguel)

  lines.push(`\n## Recursos`)
  lines.push(`- [Catálogo completo (Markdown)](${origin}/): peça com \`Accept: text/markdown\``)
  lines.push(`- [API de imóveis (JSON)](${origin}/api/properties)`)
  lines.push(`- [Sitemap](${origin}/sitemap.xml)`)

  return lines.join('\n') + '\n'
}

/** Markdown da página de um imóvel. */
export function propertyMarkdown(tenant: Tenant, p: Property, origin: string): string {
  const lines: string[] = []
  lines.push(`# ${p.title}`)
  lines.push(`\n**${priceLabel(p)}** — ${p.purpose === 'aluguel' ? 'Para alugar' : 'À venda'} · Código ${p.code}`)
  const loc = [p.neighborhood, p.city, p.state].filter(Boolean).join(', ')
  if (loc) lines.push(`\nLocalização: ${loc}`)
  lines.push(`\nCaracterísticas: ${specsLine(p)}`)
  if (p.highStandard) lines.push(`\nAlto padrão.`)
  if (p.description) lines.push(`\n## Sobre o imóvel\n\n${p.description}`)
  if (p.features.length) lines.push(`\n## Diferenciais\n\n${p.features.map((f) => `- ${f}`).join('\n')}`)
  const contact = contactBlock(tenant)
  if (contact) lines.push(`\n## Contato\n\n${contact}`)
  lines.push(`\nPágina: ${origin}/imovel/${encodeURIComponent(p.code)}`)
  return lines.join('\n') + '\n'
}
