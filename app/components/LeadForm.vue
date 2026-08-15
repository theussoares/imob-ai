<script setup lang="ts">
import { isValidBrPhone } from '~~/shared/utils/phone'

const props = defineProps<{ propertyCode?: string }>()

const name = ref('')
const phone = ref('')
const message = ref('')
const status = ref<'idle' | 'sending' | 'ok' | 'error'>('idle')
const error = ref('')

// Campo exibe (67) 99217-1768; `phone` guarda só os dígitos.
const { display: phoneDisplay, onInput: onPhoneInput } = usePhoneInput(phone, 'br')

async function submit() {
  if (!name.value.trim()) {
    error.value = 'Preencha seu nome.'
    return
  }
  if (!isValidBrPhone(phone.value)) {
    error.value = 'Telefone inválido. Ex.: (67) 99217-1768'
    return
  }
  status.value = 'sending'
  error.value = ''
  try {
    await $fetch('/api/leads', {
      method: 'POST',
      body: {
        name: name.value,
        phone: phone.value,
        message: message.value,
        propertyCode: props.propertyCode,
        source: 'form',
      },
    })
    status.value = 'ok'
    name.value = ''
    phone.value = ''
    message.value = ''
  } catch (e: unknown) {
    status.value = 'error'
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage || 'Não foi possível enviar. Tente novamente.'
  }
}
</script>

<template>
  <form class="lead" @submit.prevent="submit">
    <h4>Fale com o corretor</h4>
    <p v-if="status === 'ok'" class="lead-ok">Recebemos seu contato! Retornaremos em breve. ✅</p>
    <template v-else>
      <input v-model="name" class="admin-input" type="text" placeholder="Seu nome" />
      <input
        :value="phoneDisplay"
        class="admin-input"
        type="tel"
        inputmode="numeric"
        placeholder="(67) 99217-1768"
        @input="onPhoneInput"
      />
      <textarea v-model="message" class="admin-textarea" rows="3" placeholder="Mensagem (opcional)" />
      <p v-if="error" class="lead-err">{{ error }}</p>
      <button class="admin-btn" type="submit" :disabled="status === 'sending'">
        {{ status === 'sending' ? 'Enviando...' : 'Enviar contato' }}
      </button>
    </template>
  </form>
</template>

<style scoped>
.lead {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lead h4 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 16px;
  margin-bottom: 2px;
}
.lead-ok {
  color: var(--wa-dark);
  font-weight: 600;
}
.lead-err {
  color: #b91c1c;
  font-size: 13px;
  margin: 0;
}
</style>
