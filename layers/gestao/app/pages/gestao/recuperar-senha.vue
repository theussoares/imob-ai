<script setup lang="ts">
import { emailValido, normalizarEmail } from '../../../domain/auth'

definePageMeta({ layout: false, middleware: 'gestao' })
useHead({ title: 'Recuperar senha · Gestão', meta: [{ name: 'robots', content: 'noindex' }] })

const tenant = useTenant()
const auth = useGestaoAuth()
await auth.carregar()

const email = ref('')
const captcha = ref('')
const erro = ref('')
const enviando = ref(false)
const enviado = ref(false)
const linkDemo = ref<string | null>(null)

const podeEnviar = computed(() => emailValido(normalizarEmail(email.value)) && !!captcha.value && !enviando.value)

async function enviar() {
  if (!podeEnviar.value) return
  enviando.value = true
  erro.value = ''
  const r = await auth.recuperar(email.value, captcha.value)
  enviando.value = false
  if (!r.ok) {
    erro.value = r.erro
    captcha.value = ''
    return
  }
  // Mesma tela exista a conta ou não: dizer «não é da equipe» faria desta página um verificador de quem trabalha aqui.
  linkDemo.value = r.linkDemo
  enviado.value = true
}

const campo =
  'min-h-12 w-full rounded-xl border-[1.5px] border-[var(--line-2)] bg-[var(--paper)] px-3.5 text-[length:var(--fs-body)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
const botaoPrimario =
  'min-h-12 rounded-xl bg-[var(--gestao-amarelo)] text-[length:var(--fs-body)] font-bold text-[var(--brand)] enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]'
</script>

<template>
  <GestaoAuthShell class="gestao-tema">
    <div class="flex w-full max-w-120 flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_1px_2px_rgba(20,22,26,0.05)] sm:p-7">
      <div>
        <p class="m-0 font-bold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>
        <h1 class="m-0 text-[length:var(--fs-title-lg)] font-bold">{{ enviado ? 'Confira seu e-mail' : 'Recuperar senha' }}</h1>
      </div>

      <template v-if="enviado">
        <p role="status" class="m-0 rounded-xl bg-[var(--surface)] p-3.5" data-testid="recuperacao-enviada">
          Se esse e-mail tiver acesso ao painel, enviamos um link para criar uma nova senha. Confira também o spam.
          O link vale uma vez só e por pouco tempo.
        </p>
        <p
          v-if="auth.demo && linkDemo"
          class="m-0 rounded-xl border-2 border-dashed border-[var(--accent)] p-3 text-[length:var(--fs-label)]"
          data-testid="faixa-demo-link"
        >
          <strong class="text-[var(--accent)]">Demonstração:</strong> não há envio de e-mail. Abra o link:
          <NuxtLink :to="linkDemo.replace(/^https?:\/\/[^/]+/, '')" class="break-all font-bold" data-testid="link-demo">{{ linkDemo }}</NuxtLink>
        </p>
        <NuxtLink to="/gestao/login" class="[display:grid] min-h-12 place-items-center rounded-xl border-[1.5px] border-[var(--brand)] font-bold text-[var(--brand)] no-underline hover:bg-[var(--brand-ghost)]">
          Voltar para o login
        </NuxtLink>
      </template>

      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="enviar">
        <p class="m-0 text-[var(--ink-soft)]">Informe o e-mail que você usa para entrar. Enviamos um link para criar uma nova senha.</p>
        <div class="flex flex-col gap-1.5">
          <label for="recuperar-email" class="font-semibold">E-mail</label>
          <input
            id="recuperar-email"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            required
            :class="campo"
            data-testid="email"
          />
        </div>
        <GestaoCaptcha v-model="captcha" />
        <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="recuperar-erro">{{ erro }}</p>
        <button type="submit" :class="botaoPrimario" :disabled="!podeEnviar" data-testid="enviar-link">
          {{ enviando ? 'Enviando…' : 'Enviar link' }}
        </button>
        <NuxtLink to="/gestao/login" class="text-center font-semibold text-[var(--brand)]">Voltar para o login</NuxtLink>
      </form>
    </div>
  </GestaoAuthShell>
</template>
