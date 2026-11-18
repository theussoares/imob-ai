<script setup lang="ts">
import { validarSenha } from '../../../../domain/auth'
import { PERFIS } from '../../../../domain/permissions'

definePageMeta({ layout: false, middleware: 'gestao' })
useHead({ title: 'Criar acesso · Gestão', meta: [{ name: 'robots', content: 'noindex' }] })

const route = useRoute()
const tenant = useTenant()
const auth = useGestaoAuth()
await auth.carregar()

const token = String(route.params.token ?? '')
// Consultar não consome o convite: só decide o que a tela mostra.
const consulta = await auth.consultar(token)

const nome = ref('')
const senha = ref('')
const confirmacao = ref('')
const captcha = ref('')
const erro = ref('')
const enviando = ref(false)

const email = computed(() => (consulta.ok ? consulta.convite.email : ''))
const senhaOk = computed(() => validarSenha(senha.value, { email: email.value, nome: nome.value }).ok)
const iguais = computed(() => senha.value === confirmacao.value)
const erroConfirmacao = computed(() => (confirmacao.value && !iguais.value ? 'As senhas não são iguais.' : ''))
const podeCriar = computed(
  () => nome.value.trim().length >= 2 && senhaOk.value && !!confirmacao.value && iguais.value && !!captcha.value && !enviando.value,
)

async function criar() {
  if (!podeCriar.value) return
  enviando.value = true
  erro.value = ''
  const r = await auth.aceitar(token, nome.value, senha.value, captcha.value)
  enviando.value = false
  if (!r.ok) {
    erro.value = r.erro
    captcha.value = ''
    return
  }
  await navigateTo('/gestao/login?conta=criada')
}

const campo =
  'min-h-12 w-full rounded-xl border-[1.5px] border-[var(--line-2)] bg-[var(--paper)] px-3.5 text-[length:var(--fs-body)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
</script>

<template>
  <GestaoAuthShell class="gestao-tema">
    <div
      class="flex w-full max-w-130 flex-col gap-4 rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[var(--shadow)] sm:p-7"
    >
      <p class="m-0 font-extrabold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>

      <!-- Convite inválido: expirado, usado, cancelado ou inexistente. -->
      <template v-if="!consulta.ok">
        <h1 class="m-0 text-[length:var(--fs-title-lg)] font-extrabold">Convite indisponível</h1>
        <p role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="convite-invalido" :data-motivo="consulta.motivo">
          {{ consulta.erro }}
        </p>
        <NuxtLink
          to="/gestao/login"
          class="[display:grid] min-h-12 place-items-center rounded-xl border-[1.5px] border-[var(--brand)] font-extrabold text-[var(--brand)] no-underline hover:bg-[var(--brand-ghost)]"
        >
          Ir para o login
        </NuxtLink>
      </template>

      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="criar">
        <h1 class="m-0 text-[length:var(--fs-title-lg)] font-extrabold">Crie seu acesso</h1>

        <dl class="m-0 [display:grid] grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-[var(--surface)] p-3.5">
          <dt class="text-[var(--ink-soft)]">E-mail</dt>
          <dd class="m-0 font-bold break-all" data-testid="aceite-email">{{ consulta.convite.email }}</dd>
          <dt class="text-[var(--ink-soft)]">Perfil</dt>
          <dd class="m-0 font-bold" data-testid="aceite-perfil">{{ PERFIS[consulta.convite.perfil].nome }}</dd>
        </dl>

        <div class="flex flex-col gap-1.5">
          <label for="convite-nome" class="font-bold">Seu nome</label>
          <input id="convite-nome" v-model="nome" type="text" autocomplete="name" required :class="campo" data-testid="nome" />
        </div>

        <GestaoSenhaCampo
          id="convite-senha"
          v-model="senha"
          label="Crie uma senha"
          :email="email"
          :nome="nome"
          requisitos
          testid="senha"
        />
        <GestaoSenhaCampo
          id="convite-confirmacao"
          v-model="confirmacao"
          label="Repita a senha"
          :erro="erroConfirmacao"
          testid="senha-confirmacao"
        />

        <GestaoCaptcha v-model="captcha" />

        <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="criar-erro">{{ erro }}</p>

        <button
          type="submit"
          class="min-h-12 rounded-xl bg-[var(--brand)] text-[length:var(--fs-body)] font-extrabold text-white enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]"
          :disabled="!podeCriar"
          data-testid="criar-conta"
        >
          {{ enviando ? 'Criando…' : 'Criar conta' }}
        </button>
      </form>
    </div>
  </GestaoAuthShell>
</template>
