import type { Ref } from 'vue'
import {
  formatBrPhone,
  formatWhatsapp,
  normalizeWhatsapp,
  onlyDigits,
  isValidBrPhone,
  isValidWhatsapp,
} from '~~/shared/utils/phone'

type Variant = 'br' | 'whatsapp'

/**
 * Liga um `<input>` a um model de telefone: o campo EXIBE formatado enquanto o
 * model guarda só dígitos (br) ou dígitos com DDI 55 (whatsapp) — o que os links
 * wa.me/tel: já esperam. Use com `:value="display" @input="onInput"`.
 *
 *   const { display, onInput, isValid } = usePhoneInput(toRef(form, 'phone'), 'whatsapp')
 */
export function usePhoneInput(model: Ref<string | null | undefined>, variant: Variant = 'br') {
  const format = variant === 'whatsapp' ? formatWhatsapp : formatBrPhone
  const store = variant === 'whatsapp' ? normalizeWhatsapp : onlyDigits
  const validate = variant === 'whatsapp' ? isValidWhatsapp : isValidBrPhone

  const display = ref(format(model.value))

  // Sincroniza o display quando o model muda por fora (ex.: carregar dados do
  // servidor num watchEffect/Object.assign).
  watch(model, (v) => {
    const f = format(v)
    if (f !== display.value) display.value = f
  })

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement
    const formatted = format(el.value)
    model.value = store(el.value)
    display.value = formatted
    // Força o DOM ao valor mascarado mesmo quando `formatted` não mudou — ex.: ao
    // digitar além do limite de dígitos, o cap devolve a mesma string, o ref não
    // muda e o Vue não repintaria o input, deixando os dígitos extras na tela.
    el.value = formatted
  }

  // Vazio conta como válido (campos opcionais); obrigatoriedade é checada à parte.
  const isValid = computed(() => !model.value || validate(model.value))

  return { display, onInput, isValid }
}
