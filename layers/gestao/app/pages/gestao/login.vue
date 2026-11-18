<script setup lang="ts">
import { ORDEM_PERFIS, PERFIS } from '../../../domain/permissions'
import type { Perfil } from '../../../domain/types'

definePageMeta({ layout: false, middleware: 'gestao' })
useHead({ title: 'Entrar · Gestão', meta: [{ name: 'robots', content: 'noindex' }] })

const tenant = useTenant()
const route = useRoute()
const { entrar } = useGestaoSessao()
const auth = useGestaoAuth()
await auth.carregar()

const email = ref('')
const senha = ref('')
const captcha = ref('')
const erro = ref('')
const enviando = ref(false)

const contaCriada = computed(() => route.query.conta === 'criada')
const podeEnviar = computed(() => !!email.value.trim() && !!senha.value && !!captcha.value && !enviando.value)

async function enviar() {
  if (!podeEnviar.value) return
  enviando.value = true
  erro.value = ''
  const r = await auth.entrarComSenha(email.value, senha.value, captcha.value)
  enviando.value = false
  if (!r.ok) {
    erro.value = r.erro
    // Token de captcha é de uso único: após a falha a pessoa resolve de novo, e a
    // senha digitada sai da tela em vez de ficar à vista de quem passar por ali.
    captcha.value = ''
    senha.value = ''
    return
  }
  await navigateTo('/gestao/verificar')
}

// --- Acesso rápido (só demo): pula senha e 2º fator ---
const escolhido = ref<Perfil | null>(null)

function confirmarAtalho() {
  if (!escolhido.value) return
  entrar(escolhido.value)
  navigateTo('/gestao/vendas')
}

const campo =
  'min-h-12 w-full rounded-xl border-[1.5px] border-[var(--line-2)] bg-[var(--paper)] px-3.5 text-[length:var(--fs-body)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
</script>

<template>
  <GestaoAuthShell class="gestao-tema">
    <div class="flex w-full max-w-120 flex-col gap-4">
      <form
        class="flex flex-col gap-4 rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[var(--shadow)] sm:p-7"
        novalidate
        @submit.prevent="enviar"
      >
        <div>
          <p class="m-0 font-extrabold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>
          <h1 class="m-0 text-[length:var(--fs-title-lg)] font-extrabold">Entrar no sistema</h1>
        </div>

        <p
          v-if="contaCriada"
          role="status"
          class="m-0 rounded-xl border border-[var(--ok)] bg-[var(--brand-ghost)] p-3 font-semibold text-[var(--ok)]"
          data-testid="aviso-conta-criada"
        >
          Conta criada com sucesso. Entre com seu e-mail e a senha que você definiu.
        </p>

        <div class="flex flex-col gap-1.5">
          <label for="login-email" class="font-bold">E-mail</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            required
            :class="campo"
            :aria-describedby="erro ? 'login-erro' : undefined"
            data-testid="email"
          />
        </div>

        <GestaoSenhaCampo
          id="login-senha"
          v-model="senha"
          label="Senha"
          autocomplete="current-password"
          testid="senha"
        />

        <GestaoCaptcha v-model="captcha" />

        <p v-if="erro" id="login-erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="login-erro">
          {{ erro }}
        </p>

        <button
          type="submit"
          class="min-h-12 rounded-xl bg-[var(--gestao-amarelo)] text-[length:var(--fs-body)] font-extrabold text-[var(--brand)] enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]"
          :disabled="!podeEnviar"
          data-testid="entrar-senha"
        >
          {{ enviando ? 'Verificando…' : 'Entrar' }}
        </button>
        <p class="m-0 text-[length:var(--fs-label)] text-[var(--ink-soft)]">
          Depois da senha enviamos um código de 6 dígitos para o seu e-mail. Ainda não tem acesso? Peça um convite ao Dono ou ao Jurídico.
        </p>
      </form>

      <!-- Só com GESTAO_DEMO: sem a flag, nenhum atalho existe (spec, «Acesso e segurança»). -->
      <section
        v-if="auth.demo"
        class="flex flex-col gap-3 rounded-[var(--r)] border-2 border-dashed border-[var(--accent)] bg-[var(--paper)] p-5"
        aria-labelledby="demo-titulo"
        data-testid="faixa-demo"
      >
        <div>
          <p class="m-0 text-[length:var(--fs-caption)] font-extrabold tracking-wide text-[var(--accent)] uppercase">Demonstração</p>
          <h2 id="demo-titulo" class="m-0 text-[length:var(--fs-title-sm)] font-extrabold">Acesso rápido de demonstração</h2>
        </div>
        <p class="m-0 text-[length:var(--fs-label)] text-[var(--ink-soft)]">
          Pula senha e 2º fator para ver o que cada perfil enxerga. Para testar o fluxo completo, use um e-mail como
          <code class="font-bold">helena@olmi.exemplo</code> com a senha
          <code class="font-bold" data-testid="demo-senha">{{ auth.senhaDemo.value }}</code>.
        </p>
        <form class="flex flex-col gap-3" @submit.prevent="confirmarAtalho">
          <fieldset class="[display:grid] grid-cols-1 gap-2.5 border-0 p-0 sm:grid-cols-2">
            <legend class="sr-only">Perfil de acesso</legend>
            <label
              v-for="p in ORDEM_PERFIS"
              :key="p"
              class="relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border-[1.5px] p-3 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]"
              :class="escolhido === p ? 'border-[var(--brand)] bg-[var(--brand-ghost)]' : 'border-[var(--line-2)]'"
            >
              <input
                v-model="escolhido"
                type="radio"
                name="perfil"
                :value="p"
                class="absolute inset-0 cursor-pointer opacity-0"
                :data-testid="`perfil-${p}`"
              />
              <strong>{{ PERFIS[p].nome }}</strong>
              <span class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">{{ PERFIS[p].descricao }}</span>
            </label>
          </fieldset>
          <button
            type="submit"
            class="min-h-12 rounded-xl border-[1.5px] border-[var(--brand)] bg-[var(--paper)] font-extrabold text-[var(--brand)] enabled:cursor-pointer enabled:hover:bg-[var(--brand-ghost)] disabled:cursor-not-allowed disabled:border-[var(--line-2)] disabled:text-[var(--ink-soft)]"
            :disabled="!escolhido"
            data-testid="entrar"
          >
            {{ escolhido ? `Entrar como ${PERFIS[escolhido].nome}` : 'Escolha um perfil' }}
          </button>
        </form>
      </section>
    </div>
  </GestaoAuthShell>
</template>
