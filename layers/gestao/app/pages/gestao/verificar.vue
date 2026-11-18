<script setup lang="ts">
definePageMeta({ layout: false, middleware: 'gestao' })
useHead({ title: 'Verificar código · Gestão', meta: [{ name: 'robots', content: 'noindex' }] })

const tenant = useTenant()
const { entrar } = useGestaoSessao()
const auth = useGestaoAuth()
await auth.carregar()

const codigo = ref('')
const erro = ref('')
const aviso = ref('')
const enviando = ref(false)
const bloqueado = ref(false)
const espera = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

// Só dígitos, no máx. 6: colar «123 456» do e-mail precisa funcionar.
watch(codigo, (v) => {
  const limpo = v.replace(/\D/g, '').slice(0, 6)
  if (limpo !== v) codigo.value = limpo
})

const podeEnviar = computed(() => codigo.value.length === 6 && !enviando.value && !bloqueado.value)

function atualizarEspera() {
  espera.value = auth.segundosParaReenvio()
  if (espera.value === 0) clearInterval(timer)
}
function iniciarContagem() {
  clearInterval(timer)
  atualizarEspera()
  if (espera.value > 0) timer = setInterval(atualizarEspera, 1000)
}
onMounted(iniciarContagem)
onBeforeUnmount(() => clearInterval(timer))

let destrava: ReturnType<typeof setTimeout> | undefined
/** O bloqueio expira sozinho: a tela reabilita o campo no prazo, sem exigir recarregar. */
function bloquear(ativo: boolean, segundos = 0) {
  clearTimeout(destrava)
  bloqueado.value = ativo
  if (ativo && segundos > 0)
    destrava = setTimeout(() => {
      bloqueado.value = false
      erro.value = ''
    }, segundos * 1000)
}
onBeforeUnmount(() => clearTimeout(destrava))

async function enviar() {
  if (!podeEnviar.value) return
  enviando.value = true
  erro.value = ''
  aviso.value = ''
  const r = await auth.verificar(codigo.value)
  if (!r.ok) {
    enviando.value = false
    erro.value = r.erro
    bloquear(r.motivo === 'bloqueado', r.segundos)
    codigo.value = ''
    return
  }
  // A sessão só nasce AQUI, depois do 2º fator.
  // `http`: o servidor já devolveu a sessão (perfil, nome, corretor); `entrar` só existe no demo.
  if (!auth.http) entrar(r.conta.perfil)
  await navigateTo('/gestao/vendas')
}

async function reenviar() {
  if (espera.value > 0) return
  erro.value = ''
  const r = await auth.reenviar()
  if (!r.ok) {
    erro.value = r.erro
    bloquear(/Muitas tentativas/.test(r.erro), r.segundos)
    return
  }
  codigo.value = ''
  aviso.value = 'Enviamos um novo código. O anterior deixou de valer.'
  iniciarContagem()
}

function voltar() {
  auth.definirPendente(null)
  navigateTo('/gestao/login')
}

/** «h***@olmi.exemplo»: confirma o destino sem expor o e-mail inteiro a quem olha a tela. */
const emailMascarado = computed(() => {
  const [u = '', d = ''] = (auth.pendente.value ?? '').split('@')
  return u ? `${u[0]}${'*'.repeat(Math.max(2, u.length - 1))}@${d}` : ''
})
</script>

<template>
  <GestaoAuthShell class="gestao-tema">
    <div class="flex w-full max-w-120 flex-col gap-4">
      <form
        class="flex flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_1px_2px_rgba(20,22,26,0.05)] sm:p-7"
        novalidate
        @submit.prevent="enviar"
      >
        <div>
          <p class="m-0 font-bold text-[var(--brand)]">{{ tenant?.name || 'Gestão' }}</p>
          <h1 class="m-0 text-[length:var(--fs-title-lg)] font-bold">Confirme que é você</h1>
        </div>
        <p class="m-0 text-[var(--ink-soft)]">
          Enviamos um código de 6 dígitos para <strong class="text-[var(--ink)]">{{ emailMascarado }}</strong>. Ele vale
          por 10 minutos e só funciona uma vez.
        </p>

        <div class="flex flex-col gap-1.5">
          <label for="verificar-codigo" class="font-semibold">Código de verificação</label>
          <input
            id="verificar-codigo"
            v-model="codigo"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength="7"
            :disabled="bloqueado"
            class="min-h-14 w-full rounded-xl border-[1.5px] bg-[var(--paper)] px-3.5 text-center font-mono text-[length:var(--fs-title)] font-bold tracking-[0.5em] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:bg-[var(--surface)]"
            :class="erro ? 'border-[var(--danger)]' : 'border-[var(--line-2)]'"
            :aria-invalid="!!erro"
            :aria-describedby="erro ? 'verificar-erro' : undefined"
            data-testid="codigo"
          />
        </div>

        <p v-if="erro" id="verificar-erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="verificar-erro">
          {{ erro }}
        </p>
        <p v-if="aviso" role="status" class="m-0 font-semibold text-[var(--ok)]">{{ aviso }}</p>

        <button
          type="submit"
          class="min-h-12 rounded-xl bg-[var(--gestao-amarelo)] text-[length:var(--fs-body)] font-bold text-[var(--brand)] enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]"
          :disabled="!podeEnviar"
          data-testid="verificar"
        >
          {{ enviando ? 'Verificando…' : 'Verificar e entrar' }}
        </button>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            class="min-h-11 cursor-pointer rounded-lg px-3 font-bold text-[var(--brand)] hover:bg-[var(--brand-ghost)] disabled:cursor-not-allowed disabled:text-[var(--ink-soft)] disabled:hover:bg-transparent"
            :disabled="espera > 0"
            data-testid="reenviar"
            @click="reenviar"
          >
            {{ espera > 0 ? `Reenviar código em ${espera} s` : 'Reenviar código' }}
          </button>
          <button
            type="button"
            class="min-h-11 cursor-pointer rounded-lg px-3 font-bold text-[var(--ink-soft)] hover:bg-[var(--surface)]"
            data-testid="voltar-login"
            @click="voltar"
          >
            Voltar ao login
          </button>
        </div>
      </form>

      <!-- Só com GESTAO_DEMO: não há provedor de e-mail, então o código aparece aqui. -->
      <section
        v-if="auth.demo"
        class="rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--paper)] p-5"
        aria-labelledby="demo-titulo"
        data-testid="faixa-demo"
      >
        <p class="m-0 text-[length:var(--fs-caption)] font-bold tracking-wide text-[var(--accent)] uppercase">Demonstração</p>
        <h2 id="demo-titulo" class="m-0 text-[length:var(--fs-title-sm)] font-bold">Seu código (não há envio de e-mail no demo)</h2>
        <p class="m-0 mt-2 font-mono text-[length:var(--fs-title)] font-bold tracking-[0.3em]" data-testid="codigo-demo">
          {{ auth.codigoDemo.value ?? '— — — — — —' }}
        </p>
      </section>
    </div>
  </GestaoAuthShell>
</template>
