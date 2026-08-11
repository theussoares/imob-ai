/** Formata um valor em Reais sem centavos (ex.: R$ 320.000). */
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

/** Apenas dígitos (para links de telefone/WhatsApp). */
export function onlyDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '')
}
