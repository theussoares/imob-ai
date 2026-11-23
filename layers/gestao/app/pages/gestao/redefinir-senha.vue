<script setup lang="ts">
import { validarSenha } from '../../../domain/auth'

definePageMeta({ layout: false, middleware: 'gestao' })
useHead({ title: 'Nova senha · Gestão', meta: [{ name: 'robots', content: 'noindex' }] })

const route = useRoute()
const tenant = useTenant()
const auth = useGestaoAuth()
await auth.carregar()

// O link só abre esta página: o token NÃO é verificado aqui (a prévia do WhatsApp e o antivírus do e-mail também
// abrem links). Ele só é gasto quando a pessoa envia a nova senha.
const token = String(route.query.token_hash ?? '')
const linkVivo = await auth.linkDeRecuperacaoValido(token)

const senha = ref('')
const confirmacao = ref('')
const captcha = ref('')
const erro = ref('')
const enviando = ref(false)

const senhaOk = computed(() => validarSenha(senha.value).ok)
const iguais = computed(() => senha.value === confirmacao.value)
const erroConfirmacao = computed(() => (confirmacao.value && !iguais.value ? 'As senhas não são iguais.' : ''))
const podeSalvar = computed(() => senhaOk.value && !!confirmacao.value && iguais.value && !!captcha.value && !enviando.value)

async function salvar() {
  if (!podeSalvar.value) return
  enviando.value = true
  erro.value = ''
  const r = await auth.redefinir(token, senha.value, captcha.value)
  enviando.value = false
  if (!r.ok) {
    erro.value = r.erro
    captcha.value = ''
    // Link gasto ou vencido: recomeçar com a mesma senha digitada não adianta.
    if (r.motivo === 'link') senha.value = confirmacao.value = ''
    return
  }
  await navigateTo('/gestao/login?senha=redefinida')
}

const botaoPrimario =
  'min-h-12 rounded-xl bg-[var(--gestao-amarelo)] text-[length:var(--fs-body)] font-bold text-[var(--brand)] enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]'
const linkSecundario =
  '[display:grid] min-h-12 place-items-center rounded-xl border-[1.5px] border-[var(--brand)] font-bold text-[var(--brand)] no-underline hover:bg-[var(--brand-ghost)]'
</script>

<template>
  <GestaoAuthShell class="gestao-tema">
    <div class="flex w-full max-w-130 flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_1px_2px_rgba(20,22,26,0.05)] sm:p-7">
      <p class="m-0 font-bold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>

      <template v-if="!linkVivo">
        <h1 class="m-0 text-[length:var(--fs-title-lg)] font-bold">Link indisponível</h1>
        <p role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="link-invalido">
          Este link expirou ou já foi usado. Peça um novo na tela de login.
        </p>
        <NuxtLink to="/gestao/recuperar-senha" :class="linkSecundario">Pedir novo link</NuxtLink>
      </template>

      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="salvar">
        <h1 class="m-0 text-[length:var(--fs-title-lg)] font-bold">Crie uma nova senha</h1>
        <p class="m-0 text-[var(--ink-soft)]">
          Depois de salvar, todos os acessos abertos saem e o próximo login pede o código enviado por e-mail.
        </p>
        <GestaoSenhaCampo id="nova-senha" v-model="senha" label="Nova senha" requisitos testid="senha" />
        <GestaoSenhaCampo id="nova-senha-confirmacao" v-model="confirmacao" label="Repita a senha" :erro="erroConfirmacao" testid="senha-confirmacao" />
        <GestaoCaptcha v-model="captcha" />
        <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="redefinir-erro">{{ erro }}</p>
        <button type="submit" :class="botaoPrimario" :disabled="!podeSalvar" data-testid="salvar-senha">
          {{ enviando ? 'Salvando…' : 'Salvar nova senha' }}
        </button>
      </form>
    </div>
  </GestaoAuthShell>
</template>
