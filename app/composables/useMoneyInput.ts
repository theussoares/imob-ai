import type { Ref } from 'vue'

/** Exibe um inteiro em reais como "R$ 350.000" (sem centavos, como o resto do app). */
export function formatBRLInput(value: number): string {
  return value > 0 ? 'R$ ' + value.toLocaleString('pt-BR') : ''
}

/**
 * Liga um `<input type="text">` a um model numérico de preço: o campo EXIBE
 * "R$ 350.000" enquanto o model guarda o número inteiro 350000. Use com
 * `:value="display" @input="onInput"`.
 *
 * Reais inteiros (sem centavos) — o preço no banco é inteiro e o app formata
 * sem centavos em todo lugar (ver formatBRL).
 */
export function useMoneyInput(model: Ref<number>) {
  const display = ref(formatBRLInput(model.value))

  watch(model, (v) => {
    const f = formatBRLInput(v)
    if (f !== display.value) display.value = f
  })

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement
    const digits = el.value.replace(/\D/g, '')
    const num = digits ? parseInt(digits, 10) : 0
    model.value = num
    const formatted = formatBRLInput(num)
    display.value = formatted
    // Força o DOM ao valor formatado mesmo quando não mudou (ex.: digitar uma
    // letra): sem isto, o ref inalterado não repinta e o caractere fica na tela.
    el.value = formatted
  }

  return { display, onInput }
}
