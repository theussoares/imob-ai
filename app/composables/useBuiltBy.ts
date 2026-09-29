/**
 * Crédito do desenvolvedor: nome e link de WhatsApp com a mensagem pronta.
 *
 * Um lugar só porque o crédito aparece em mais de uma moldura (rodapé do site
 * e telas da Área do Cliente) e a mensagem pronta é a primeira coisa que se lê
 * do outro lado — duas cópias divergiriam no texto, e a MA Tech receberia
 * pedidos sem saber de onde vieram.
 *
 * `link` é null sem número configurado: um `href="#"` viraria um link morto que
 * só rola a página para o topo. Quem usa mostra o nome como texto.
 */
export function useBuiltBy() {
  const config = useRuntimeConfig()
  const name = config.public.builtByName || 'MA Tech'
  const link = computed(() => {
    const wa = (config.public.builtByWhatsapp || '').replace(/\D/g, '')
    if (!wa) return null
    const msg = `Olá, ${name}! Vi um site que você desenvolveu e gostaria de um orçamento.`
    return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`
  })
  return { name, link }
}
