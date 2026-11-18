<script setup lang="ts">
import { formatBrPhone, isValidBrPhone, onlyDigits } from '~~/shared/utils/phone'

/**
 * Telefone com máscara `(67) 99999-9999`. Só dígitos entram (letras são descartadas ao
 * digitar/colar) e o formato é conferido ao sair do campo, não só ao salvar. Vazio é
 * aceito: a obrigatoriedade é de quem usa o campo. O erro vai no próprio campo
 * (`aria-invalid` + `aria-describedby`).
 */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: string; classe?: string; rotulo?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const id = useId()
const tocado = ref(false)
const erro = computed(() => (tocado.value && props.modelValue.trim() && !isValidBrPhone(props.modelValue) ? 'Telefone inválido. Use DDD + número.' : ''))

function digitar(e: Event) {
  const el = e.target as HTMLInputElement
  const f = formatBrPhone(onlyDigits(el.value))
  el.value = f
  emit('update:modelValue', f)
}
</script>

<template>
  <span class="[display:grid] gap-1">
    <input
      v-bind="$attrs"
      :value="modelValue ? formatBrPhone(modelValue) : ''"
      :class="classe"
      type="tel"
      inputmode="tel"
      maxlength="15"
      autocomplete="off"
      placeholder="(67) 99999-9999"
      :aria-invalid="erro ? 'true' : undefined"
      :aria-describedby="erro ? `${id}-erro` : undefined"
      @input="digitar"
      @blur="tocado = true"
    />
    <span v-if="erro" :id="`${id}-erro`" class="text-[length:var(--fs-caption)] font-semibold text-[#b91c1c]">{{ erro }}</span>
  </span>
</template>
