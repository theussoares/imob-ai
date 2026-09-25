<script setup lang="ts">
import { isValidBrPhone } from '~~/shared/utils/phone'
import type { LeadSource, LeadType } from '~~/shared/models/lead'

const { rastrear } = useRastreio()

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
    /**
     * Nível do título, para encaixar na hierarquia de quem usa o formulário.
     * Fixo em h4, ele pulava nível em todo lugar: na home vinha logo depois de
     * um h2, e leitor de tela navega por título — um salto de h2 para h4 soa
     * como se faltasse uma seção.
     */
    headingLevel?: 2 | 3 | 4
    /**
     * Botão de envio secundário (contorno). Na página do imóvel o formulário
     * fica logo abaixo do "Tenho interesse" do WhatsApp: dois botões cheios,
     * de cores diferentes, no mesmo cartão disputavam qual era a ação
     * principal. Lá o WhatsApp é a principal; o formulário, a alternativa.
     */
    secondary?: boolean
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
    headingLevel: 3,
    secondary: false,
  },
)

const name = ref('')
const phone = ref('')
const message = ref('')
const status = ref<'idle' | 'sending' | 'ok' | 'error'>('idle')
/** Erro do envio (servidor/rede) — os de campo moram em `fieldErrors`. */
const error = ref('')

/**
 * Erro por campo, exibido logo abaixo dele.
 *
 * Antes havia uma mensagem só, em cima do botão: no celular, com o teclado
 * aberto, ela aparecia fora da tela e a pessoa não sabia qual campo corrigir.
 *
 * A validação roda ao SAIR do campo (blur), não a cada tecla — acusar
 * "telefone inválido" no terceiro dígito é bronca por algo que a pessoa ainda
 * está fazendo. Depois que o erro apareceu, ele é reavaliado a cada tecla, para
 * sumir no instante em que o campo fica certo. É o arranjo que o estudo de
 * validação inline do Luke Wroblewski encontrou com mais acerto e menos tempo.
 */
const fieldErrors = reactive<{ name: string; phone: string }>({ name: '', phone: '' })

function validateField(field: 'name' | 'phone'): boolean {
  if (field === 'name') fieldErrors.name = name.value.trim() ? '' : 'Preencha seu nome.'
  else fieldErrors.phone = isValidBrPhone(phone.value) ? '' : 'Telefone inválido. Ex.: (67) 99123-4567'
  return !fieldErrors[field]
}
function revalidateIfShown(field: 'name' | 'phone') {
  if (fieldErrors[field]) validateField(field)
}

/**
 * O formulário aparece mais de uma vez na mesma página (o do catálogo vazio e o
 * do rodapé da listagem). `for`/`id` fixos criariam ids repetidos, e o rótulo
 * passaria a apontar para o campo do outro formulário.
 */
const uid = useId()

// Campo exibe (67) 99123-4567; `phone` guarda só os dígitos.
const { display: phoneDisplay, onInput: onPhoneInput } = usePhoneInput(phone, 'br')
watch(name, () => revalidateIfShown('name'))
watch(phone, () => revalidateIfShown('phone'))

const nameEl = ref<HTMLInputElement | null>(null)
const phoneEl = ref<HTMLInputElement | null>(null)

async function submit() {
  const nomeOk = validateField('name')
  const foneOk = validateField('phone')
  if (!nomeOk || !foneOk) {
    // Foco no primeiro campo reprovado: é ali que a pessoa precisa agir, e o
    // leitor de tela lê o erro junto, via aria-describedby.
    ;(nomeOk ? phoneEl : nameEl).value?.focus()
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
    // Só a origem e o tipo: o conteúdo do formulário não sai para a Vercel.
    rastrear('lead_enviado', { origem: props.source ?? 'sem_origem', comImovel: !!props.propertyCode })
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
  <form class="lead" novalidate @submit.prevent="submit">
    <component :is="`h${headingLevel}`" class="lead-title">{{ title }}</component>
    <!--
      Região viva sempre no DOM, com o conteúdo entrando nela: um elemento que
      já nasce com role="status" nem sempre é anunciado, e o sucesso do envio
      passaria em silêncio para quem usa leitor de tela.
    -->
    <div role="status" aria-live="polite">
      <p v-if="status === 'ok'" class="lead-ok">{{ okMessage }}</p>
    </div>
    <template v-if="status !== 'ok'">
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

        O asterisco marca o obrigatório e é `aria-hidden` porque o
        `aria-required` já diz isso ao leitor de tela — lido duas vezes, vira
        "Seu nome asterisco obrigatório".
      -->
      <div class="lead-field">
        <label :for="`lead-nome-${uid}`">Seu nome <span class="req" aria-hidden="true">*</span></label>
        <input
          :id="`lead-nome-${uid}`"
          ref="nameEl"
          v-model="name"
          class="admin-input"
          type="text"
          autocomplete="name"
          aria-required="true"
          :aria-invalid="!!fieldErrors.name || undefined"
          :aria-describedby="fieldErrors.name ? `lead-nome-err-${uid}` : undefined"
          placeholder="Como podemos te chamar?"
          @blur="validateField('name')"
        />
        <p v-if="fieldErrors.name" :id="`lead-nome-err-${uid}`" class="lead-err">
          {{ fieldErrors.name }}
        </p>
      </div>

      <div class="lead-field">
        <label :for="`lead-fone-${uid}`">WhatsApp <span class="req" aria-hidden="true">*</span></label>
        <input
          :id="`lead-fone-${uid}`"
          ref="phoneEl"
          :value="phoneDisplay"
          class="admin-input"
          type="tel"
          inputmode="numeric"
          autocomplete="tel-national"
          aria-required="true"
          :aria-invalid="!!fieldErrors.phone || undefined"
          :aria-describedby="fieldErrors.phone ? `lead-fone-err-${uid}` : undefined"
          placeholder="(67) 99123-4567"
          @input="onPhoneInput"
          @blur="phone && validateField('phone')"
        />
        <p v-if="fieldErrors.phone" :id="`lead-fone-err-${uid}`" class="lead-err">
          {{ fieldErrors.phone }}
        </p>
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

      <!-- role="alert": falha de envio aparece depois do clique, sem campo
           nenhum para apontar. Sem isto, quem usa leitor de tela clica em
           enviar e não acontece nada perceptível. -->
      <p v-if="error" class="lead-err" role="alert">{{ error }}</p>
      <button
        class="admin-btn"
        :class="{ ghost: secondary }"
        type="submit"
        :disabled="status === 'sending'"
      >
        {{ status === 'sending' ? 'Enviando...' : submitLabel }}
      </button>
      <!--
        Junto do botão: é aqui que a pessoa decide se confia o telefone a um
        site que acabou de conhecer, e a LGPD pede a finalidade informada no
        ponto da coleta — o quero-vender já dizia isso, este formulário não.
        O link leva à política, que diz o resto (prazo, com quem, direitos).
      -->
      <p class="lead-legal">
        Usamos seu contato só para responder a este pedido. Sem cadastro e sem
        lista de e-mail. <NuxtLink to="/privacidade">Privacidade</NuxtLink>
      </p>
    </template>
  </form>
</template>

<style scoped>
.lead {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lead-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: var(--fs-body);
  margin: 0 0 2px;
}
.lead-ok {
  color: var(--wa-dark);
  font-weight: 600;
}
.lead-intro {
  margin: 0;
  font-size: var(--fs-ui);
  line-height: 1.55;
  color: var(--ink-soft);
}
.lead-err {
  color: #b91c1c;
  font-size: var(--fs-label);
  margin: 0;
}
.req {
  color: #b91c1c;
}
.lead-legal {
  margin: 0;
  font-size: var(--fs-caption);
  line-height: 1.5;
  color: var(--ink-soft);
}
.lead-legal a {
  color: inherit;
  text-decoration: underline;
}
.lead-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.lead-field label {
  font-size: var(--fs-caption);
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
