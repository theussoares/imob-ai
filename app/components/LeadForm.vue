<script setup lang="ts">
import { isValidBrPhone } from '~~/shared/utils/phone'
import type { LeadSource, LeadType } from '~~/shared/models/lead'

const props = withDefaults(
  defineProps<{
    propertyCode?: string
    /** De onde este formulário está sendo enviado — vira métrica de aquisição. */
    source?: LeadSource
    /**
     * O que a pessoa quer. Ignorado quando há `propertyCode`: nesse caso o
     * servidor deriva do `purpose` do imóvel, que é mais confiável que o
     * formulário.
     */
    leadType?: LeadType
    /** Título do bloco. Muda conforme onde o formulário aparece. */
    title?: string
    /** Linha de contexto acima dos campos. Omitida quando vazia. */
    intro?: string
    notePlaceholder?: string
    submitLabel?: string
    okMessage?: string
    /**
     * Monta a mensagem final a partir do que a pessoa escreveu.
     *
     * É função, e não um prefixo de texto, para que o formato viva num lugar só.
     * A captura do catálogo, por exemplo, precisa juntar os filtros ativos à
     * observação — se o formulário também soubesse juntar, existiriam duas
     * regras de formatação para o mesmo campo, e elas divergiriam.
     */
    buildMessage?: (note: string) => string
  }>(),
  {
    propertyCode: undefined,
    source: 'outro',
    leadType: 'indefinido',
    title: 'Fale com o corretor',
    intro: '',
    notePlaceholder: 'Mensagem (opcional)',
    submitLabel: 'Enviar contato',
    okMessage: 'Recebemos seu contato! Retornaremos em breve. ✅',
    buildMessage: (note: string) => note,
  },
)

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
        message: props.buildMessage(message.value),
        propertyCode: props.propertyCode,
        source: props.source,
        leadType: props.leadType,
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
    <h4>{{ title }}</h4>
    <p v-if="status === 'ok'" class="lead-ok">{{ okMessage }}</p>
    <template v-else>
      <p v-if="intro" class="lead-intro">{{ intro }}</p>
      <input v-model="name" class="admin-input" type="text" placeholder="Seu nome" />
      <input
        :value="phoneDisplay"
        class="admin-input"
        type="tel"
        inputmode="numeric"
        placeholder="(67) 99217-1768"
        @input="onPhoneInput"
      />
      <textarea v-model="message" class="admin-textarea" rows="3" :placeholder="notePlaceholder" />
      <p v-if="error" class="lead-err">{{ error }}</p>
      <button class="admin-btn" type="submit" :disabled="status === 'sending'">
        {{ status === 'sending' ? 'Enviando...' : submitLabel }}
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
.lead-intro {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-soft);
}
.lead-err {
  color: #b91c1c;
  font-size: 13px;
  margin: 0;
}
</style>
