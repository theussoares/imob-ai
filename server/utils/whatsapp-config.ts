/**
 * Segredos do app da Moradi na Meta. Por `segredoDeRuntime`, como os demais —
 * ver `test/server/segredos-em-runtime.test.ts` para o incidente de 17/09.
 */
export function whatsappAppSecret(): string {
  return segredoDeRuntime(useRuntimeConfig().whatsappAppSecret, 'WHATSAPP_APP_SECRET')
}

export function whatsappVerifyToken(): string {
  return segredoDeRuntime(useRuntimeConfig().whatsappVerifyToken, 'WHATSAPP_VERIFY_TOKEN')
}

/** Id do app na Meta — público (vai no JS do popup), mas o servidor precisa dele para trocar o `code`. */
export function whatsappAppId(): string {
  return String(useRuntimeConfig().public.whatsappAppId || '').trim()
}
