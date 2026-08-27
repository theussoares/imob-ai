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
/** Qual campo a validação reprovou — vira `aria-invalid` no input certo. */
const invalidField = ref<'name' | 'phone' | null>(null)

/**
 * O formulário aparece mais de uma vez na mesma página (o do catálogo vazio e o
 * do rodapé da listagem). `for`/`id` fixos criariam ids repetidos, e o rótulo
 * passaria a apontar para o campo do outro formulário.
 */
const uid = useId()

// Campo exibe (67) 99123-4567; `phone` guarda só os dígitos.
const { display: phoneDisplay, onInput: onPhoneInput } = usePhoneInput(phone, 'br')

async function submit() {
  if (!name.value.trim()) {
    error.value = 'Preencha seu nome.'
    invalidField.value = 'name'
    return
  }
  if (!isValidBrPhone(phone.value)) {
    error.value = 'Telefone inválido. Ex.: (67) 99123-4567'
    invalidField.value = 'phone'
    return
  }
  status.value = 'sending'
  error.value = ''
  invalidField.value = null
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

      <!--
        Rótulo de verdade em cada campo, não só `placeholder`.

        O placeholder some no primeiro caractere: quem foi interrompido no meio
        do preenchimento volta para dois campos sem nome nenhum. Leitor de tela
        não anuncia placeholder como rótulo, e navegação por voz não tem como
        dizer "clique em Seu nome" se o nome não existe. É a WCAG 3.3.2, e é
        também o campo mais próximo do dinheiro no site inteiro.

        `autocomplete`: no celular preenche nome e telefone de uma vez. Num
        formulário de lead, cada campo que a pessoa não precisa digitar é
        conversão que não se perde no caminho.
      -->
      <div class="lead-field">
        <label :for="`lead-nome-${uid}`">Seu nome</label>
        <input
          :id="`lead-nome-${uid}`"
          v-model="name"
          class="admin-input"
          type="text"
          autocomplete="name"
          :aria-invalid="invalidField === 'name' || undefined"
          placeholder="Como podemos te chamar?"
        />
      </div>

      <div class="lead-field">
        <label :for="`lead-fone-${uid}`">WhatsApp</label>
        <input
          :id="`lead-fone-${uid}`"
          :value="phoneDisplay"
          class="admin-input"
          type="tel"
          inputmode="numeric"
          autocomplete="tel-national"
          :aria-invalid="invalidField === 'phone' || undefined"
          placeholder="(67) 99123-4567"
          @input="onPhoneInput"
        />
      </div>

      <div class="lead-field">
        <label :for="`lead-msg-${uid}`">{{ notePlaceholder }}</label>
        <textarea
          :id="`lead-msg-${uid}`"
          v-model="message"
          class="admin-textarea"
          rows="3"
        />
      </div>

      <!-- role="alert": o erro aparece depois do clique, longe de onde a pessoa
           está olhando. Sem isto, quem usa leitor de tela clica em enviar e não
           acontece nada perceptível. -->
      <p v-if="error" class="lead-err" role="alert">{{ error }}</p>
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
.lead-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.lead-field label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
/* Não é só a cor que marca o campo reprovado: quem não distingue vermelho
   precisa da borda mais grossa, e a mensagem em texto diz qual é o problema. */
.lead-field :deep(.admin-input[aria-invalid]) {
  border-color: #b91c1c;
  border-width: 2px;
}
</style>
