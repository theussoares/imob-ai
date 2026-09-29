<script setup lang="ts">
/**
 * Campo de senha das telas de acesso (`AuthShell`), com o botão de mostrar.
 *
 * Mostrar a senha não é enfeite: no celular, errar uma letra no teclado
 * pequeno é a causa mais comum de "a senha não funciona", e a pessoa só
 * descobre vendo o que digitou.
 */
defineProps<{
  id: string
  autocomplete: 'current-password' | 'new-password'
  placeholder?: string
}>()
const model = defineModel<string>({ required: true })
const visivel = ref(false)

/**
 * No envio, o campo volta a ser `password` antes de o navegador ler o
 * formulário. Enviado como `text`, o gerenciador de senhas não reconhece a
 * credencial e não oferece salvar, e alguns navegadores guardam o valor no
 * histórico de autopreenchimento de campos comuns — a senha visível para
 * qualquer um que digite a primeira letra no mesmo campo depois.
 *
 * Captura no `<form>` (e não um prop que cada página teria de lembrar de
 * ligar): as seis telas de acesso ficam cobertas por construção.
 */
const raiz = ref<HTMLElement | null>(null)
function esconder() {
  visivel.value = false
}
let form: HTMLFormElement | null = null
onMounted(() => {
  form = raiz.value?.closest('form') ?? null
  form?.addEventListener('submit', esconder, true)
})
onBeforeUnmount(() => form?.removeEventListener('submit', esconder, true))
</script>

<template>
  <div ref="raiz" class="pa-campo">
    <AppIcon name="lock" class="pa-campo-ic" />
    <input
      :id="id"
      v-model="model"
      class="pa-inp com-olho"
      :type="visivel ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      required
    >
    <button
      type="button"
      class="pa-olho"
      :aria-label="visivel ? 'Esconder senha' : 'Mostrar senha'"
      :aria-pressed="visivel"
      @click="visivel = !visivel"
    >
      <AppIcon :name="visivel ? 'eye-off' : 'eye'" />
    </button>
  </div>
</template>
