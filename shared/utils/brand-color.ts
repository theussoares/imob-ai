/** Cor da plataforma, usada quando o tenant não tem uma válida. */
export const DEFAULT_BRAND_COLOR = '#0f3d38'

const HEX = /^#[0-9a-f]{3,8}$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/**
 * Só deixa passar cor hex.
 *
 * `brand_primary`, `brand_accent` e `whatsapp_button_color` são texto livre no
 * banco e vão parar dentro de CSS (o `<style>` de tema do `app.vue`), de um SVG
 * (favicon, card de OG) e de um JSON servido ao navegador (manifest).
 *
 * Mora em `shared/` porque o `<style>` de tema é montado no `app.vue`, que roda
 * também no navegador — uma cópia só do servidor deixava justamente o CSS de
 * fora, e foi assim que ficou até 25/09.
 *
 * Validar na GRAVAÇÃO (`assertTenantSettingsInput`) não basta: o membro grava
 * `tenants` com o próprio client, e a tabela aceita UPDATE direto pelo
 * PostgREST, sem passar pela API. Quem lê é quem precisa desconfiar. Havia em
 * produção um `brand_accent = 'VD001'`, que chegava ao CSS como está.
 */
export function safeBrandColor(value: string | null | undefined, fallback = DEFAULT_BRAND_COLOR): string {
  return isHexColor(value) ? value : fallback
}

interface CoresDoTema {
  brandPrimary: string | null
  brandAccent: string | null
  whatsappButtonColor: string | null
}

/** Declarações de variável CSS do tema, só com as cores válidas. */
export function temaCss(cores: CoresDoTema): string {
  const vars: [string, string | null][] = [
    ['--brand', cores.brandPrimary],
    ['--accent', cores.brandAccent],
    ['--wa', cores.whatsappButtonColor],
  ]
  return vars
    .filter((v): v is [string, string] => isHexColor(v[1]))
    .map(([nome, cor]) => `${nome}:${cor};`)
    .join('')
}
