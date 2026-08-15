/**
 * Utilidades de telefone compartilhadas entre client (máscara/validação nos
 * formulários) e server (validação nos endpoints) — uma fonte de verdade só.
 *
 * Dois formatos convivem no app:
 *  - "br":       telefone humano sem DDI  → 10 díg. (fixo) ou 11 (celular).
 *                Ex. exibição: (67) 99217-1768. Usado no lead do site.
 *  - "whatsapp": número que alimenta links wa.me / tel:, COM DDI 55 →
 *                12 díg. (fixo) ou 13 (celular). Ex.: +55 (67) 99217-1768.
 *                Usado nos campos do painel (tenant, corretor, proprietário).
 */

/** Só os dígitos de uma string (remove máscara, espaços, +, etc.). */
export function onlyDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '')
}

// ---- Formato "br" (sem DDI) -------------------------------------------------

/** Telefone BR válido sem DDI: 10 (fixo) ou 11 (celular) dígitos. */
export function isValidBrPhone(value?: string | null): boolean {
  const d = onlyDigits(value)
  return d.length === 10 || d.length === 11
}

/** Formata progressivamente para (67) 3521-1234 / (67) 99217-1768. */
export function formatBrPhone(value?: string | null): string {
  const d = onlyDigits(value).slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  const rest = d.slice(2)
  const head = `(${d.slice(0, 2)}) `
  if (rest.length <= 4) return head + rest
  // 11 díg. (celular) quebra em 5-4; até 10 (fixo/parcial) em 4-4.
  const split = d.length >= 11 ? 5 : 4
  return head + rest.slice(0, split) + '-' + rest.slice(split)
}

// ---- Formato "whatsapp" (com DDI 55) ---------------------------------------

/** Garante DDI 55 na frente e no máximo 13 dígitos. Vazio continua vazio. */
export function normalizeWhatsapp(value?: string | null): string {
  let d = onlyDigits(value)
  if (!d) return ''
  if (!d.startsWith('55')) d = '55' + d
  return d.slice(0, 13)
}

/** WhatsApp BR válido com DDI 55: 12 (fixo) ou 13 (celular) dígitos. */
export function isValidWhatsapp(value?: string | null): boolean {
  const d = onlyDigits(value)
  return d.startsWith('55') && (d.length === 12 || d.length === 13)
}

/** Formata para +55 (67) 99217-1768. */
export function formatWhatsapp(value?: string | null): string {
  const d = normalizeWhatsapp(value)
  if (!d) return ''
  if (d.length <= 2) return `+${d}`
  return `+55 ${formatBrPhone(d.slice(2))}`
}
