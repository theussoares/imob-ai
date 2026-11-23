<script setup lang="ts">
import { validarSenha } from '../../../domain/auth'

definePageMeta({ layout: false, middleware: 'gestao' })
useHead({ title: 'Recuperar senha · Gestão', meta: [{ name: 'robots', content: 'noindex' }] })

const tenant = useTenant()
const auth = useGestaoAuth()
// Ver o comentário do link no login: sem o demo esta tela trocaria uma senha que não existe.
if (!auth.demo) await navigateTo('/gestao/login', { replace: true })
await auth.carregar()

/** 1 = pede o código; 2 = código + senha nova. O e-mail digitado no passo 1 segue para o 2. */
const passo = ref<1 | 2>(1)
const email = ref('')
const codigo = ref('')
const senha = ref('')
const confirmacao = ref('')
const captcha = ref('')
const erro = ref('')
const enviando = ref(false)

// Só dígitos, no máx. 6: colar «123 456» do e-mail precisa funcionar.
watch(codigo, (v) => {
  const limpo = v.replace(/\D/g, '').slice(0, 6)
  if (limpo !== v) codigo.value = limpo
})

const senhaOk = computed(() => validarSenha(senha.value, { email: email.value }).ok)
const iguais = computed(() => senha.value === confirmacao.value)
const erroConfirmacao = computed(() => (confirmacao.value && !iguais.value ? 'As senhas não são iguais.' : ''))
const podePedir = computed(() => !!email.value.trim() && !!captcha.value && !enviando.value)
const podeRedefinir = computed(
  () => codigo.value.length === 6 && senhaOk.value && !!confirmacao.value && iguais.value && !!captcha.value && !enviando.value,
)

async function pedir() {
  if (!podePedir.value) return
  enviando.value = true
  erro.value = ''
  const r = await auth.pedirRedefinicao(email.value, captcha.value)
  enviando.value = false
  captcha.value = ''
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  // Vai ao passo 2 exista a conta ou não: mudar de tela só para quem tem conta
  // diria quem trabalha aqui.
  passo.value = 2
}

async function redefinir() {
  if (!podeRedefinir.value) return
  enviando.value = true
  erro.value = ''
  const r = await auth.redefinir(email.value, codigo.value, senha.value, captcha.value)
  enviando.value = false
  if (!r.ok) {
    const restantes = 'restantes' in r ? r.restantes : undefined
    erro.value = r.erro + (restantes !== undefined && r.motivo === 'invalido' ? ` Restam ${restantes} tentativas.` : '')
    captcha.value = ''
    // Código errado, expirado ou bloqueado não se corrige com a mesma digitação.
    if (r.motivo !== 'senha') codigo.value = ''
    return
  }
  await navigateTo('/gestao/login?senha=redefinida')
}

const campo =
  'min-h-12 w-full rounded-xl border-[1.5px] border-[var(--line-2)] bg-[var(--paper)] px-3.5 text-[length:var(--fs-body)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
const botao =
  'min-h-12 rounded-xl bg-[var(--brand)] text-[length:var(--fs-body)] font-extrabold text-white enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]'
</script>

<template>
  <main class="[display:grid] min-h-dvh place-items-center bg-[var(--surface)] p-4">
    <div class="flex w-full max-w-120 flex-col gap-4">
      <form
        v-if="passo === 1"
        class="flex flex-col gap-4 rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[var(--shadow)] sm:p-7"
        novalidate
        @submit.prevent="pedir"
      >
        <div>
          <p class="m-0 font-extrabold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>
          <h1 class="m-0 text-[length:var(--fs-title-lg)] font-extrabold">Recuperar senha</h1>
        </div>
        <p class="m-0 text-[var(--ink-soft)]">Informe o e-mail do seu acesso. Se ele existir, enviamos um código de 6 dígitos.</p>

        <div class="flex flex-col gap-1.5">
          <label for="recuperar-email" class="font-bold">E-mail</label>
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

        <button type="submit" :class="botao" :disabled="!podePedir" data-testid="pedir-codigo">
          {{ enviando ? 'Enviando…' : 'Enviar código' }}
        </button>
        <NuxtLink to="/gestao/login" class="min-h-11 self-start rounded-lg px-1 py-2.5 font-bold text-[var(--ink-soft)] hover:underline">
          Voltar ao login
        </NuxtLink>
      </form>

      <form
        v-else
        class="flex flex-col gap-4 rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[var(--shadow)] sm:p-7"
        novalidate
        @submit.prevent="redefinir"
      >
        <div>
          <p class="m-0 font-extrabold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>
          <h1 class="m-0 text-[length:var(--fs-title-lg)] font-extrabold">Crie uma nova senha</h1>
        </div>
        <p class="m-0 text-[var(--ink-soft)]" role="status" data-testid="codigo-enviado">
          Se <strong class="text-[var(--ink)]">{{ email }}</strong> tiver acesso, enviamos um código de 6 dígitos. Ele vale por 10
          minutos e só funciona uma vez.
        </p>

        <div class="flex flex-col gap-1.5">
          <label for="recuperar-codigo" class="font-bold">Código</label>
          <input
            id="recuperar-codigo"
            v-model="codigo"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="7"
            class="min-h-14 w-full rounded-xl border-[1.5px] border-[var(--line-2)] bg-[var(--paper)] px-3.5 text-center font-mono text-[length:var(--fs-title)] font-bold tracking-[0.5em] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            data-testid="codigo"
          />
        </div>

        <GestaoSenhaCampo
          id="recuperar-senha"
          v-model="senha"
          label="Nova senha"
          :email="email"
          requisitos
          testid="senha"
        />
        <GestaoSenhaCampo
          id="recuperar-confirmacao"
          v-model="confirmacao"
          label="Repita a nova senha"
          :erro="erroConfirmacao"
          testid="senha-confirmacao"
        />

        <GestaoCaptcha v-model="captcha" />

        <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="recuperar-erro">{{ erro }}</p>

        <button type="submit" :class="botao" :disabled="!podeRedefinir" data-testid="redefinir">
          {{ enviando ? 'Salvando…' : 'Salvar nova senha' }}
        </button>
        <button
          type="button"
          class="min-h-11 cursor-pointer self-start rounded-lg px-1 font-bold text-[var(--ink-soft)] hover:underline"
          data-testid="trocar-email"
          @click="((passo = 1), (erro = ''), (codigo = ''), (senha = ''), (confirmacao = ''))"
        >
          Usar outro e-mail
        </button>
      </form>

      <!-- Só com GESTAO_DEMO: não há provedor de e-mail, então o código aparece aqui. -->
      <section
        v-if="auth.demo && passo === 2"
        class="rounded-[var(--r)] border-2 border-dashed border-[var(--accent)] bg-[var(--paper)] p-5"
        aria-labelledby="demo-titulo"
        data-testid="faixa-demo"
      >
        <p class="m-0 text-[length:var(--fs-caption)] font-extrabold tracking-wide text-[var(--accent)] uppercase">Demonstração</p>
        <h2 id="demo-titulo" class="m-0 text-[length:var(--fs-title-sm)] font-extrabold">Seu código (não há envio de e-mail no demo)</h2>
        <p class="m-0 mt-2 font-mono text-[length:var(--fs-title)] font-extrabold tracking-[0.3em]" data-testid="codigo-demo">
          {{ auth.codigoRedefinicaoDemo.value ?? '— — — — — —' }}
        </p>
      </section>
    </div>
  </main>
</template>
