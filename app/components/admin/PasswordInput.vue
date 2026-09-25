<script setup lang="ts">
/**
 * Campo de senha com "mostrar/ocultar".
 *
 * No celular, digitar senha às cegas é onde mais se erra, e a pessoa só
 * descobre depois do "E-mail ou senha inválidos" — sem saber qual dos dois.
 * Ver o que digitou resolve (Material, "password-toggle"). Colar continua
 * liberado: gerenciador de senha é o caminho mais seguro, e bloquear colar o
 * quebraria (WCAG 3.3.8).
 *
 * O botão fica FORA da ordem de envio (`type="button"`) e diz o estado pelo
 * rótulo, que muda — "Mostrar senha" / "Ocultar senha".
 */
const model = defineModel<string>({ required: true });
defineProps<{ id: string; autocomplete: string; describedby?: string }>();
const visivel = ref(false);
</script>

<template>
  <div class="pw">
    <input
      :id="id"
      v-model="model"
      class="admin-input"
      :type="visivel ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :aria-describedby="describedby"
      autocapitalize="off"
      spellcheck="false"
      required
    />
    <button
      type="button"
      class="pw-toggle"
      :aria-label="visivel ? 'Ocultar senha' : 'Mostrar senha'"
      :aria-controls="id"
      @click="visivel = !visivel"
    >
      <AppIcon :name="visivel ? 'eye-off' : 'eye'" />
    </button>
  </div>
</template>

<style scoped>
.pw {
  position: relative;
}
.pw .admin-input {
  padding-right: 52px;
}
.pw-toggle {
  position: absolute;
  top: 50%;
  right: 2px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  color: var(--ink-soft);
  cursor: pointer;
  border-radius: 8px;
}
.pw-toggle :deep(svg) {
  width: 20px;
  height: 20px;
}
</style>
