<script setup lang="ts">
/**
 * Captcha atrás de uma interface só: `v-model` de um TOKEN (string vazia = não
 * resolvido). As telas não sabem quem emite o token — por isso trocar de
 * provedor não toca em login, convite nem verificação.
 *
 * Sem `public.turnstileSiteKey` vale a implementação do DEMO: um desafio simulado («Não sou um robô») que
 * devolve um token falso depois de uma pequena espera, SEM script de terceiro.
 * Ela NÃO barra robô nenhum; só exercita o fluxo (botão bloqueado até resolver,
 * token renovado a cada tentativa).
 *
 * Com a site key, renderiza o Cloudflare Turnstile: o `callback` do widget faz
 * `modelo.value = token` e o `expired-callback` faz `modelo.value = ''`. O token
 * só vale se o SERVIDOR o validar em `siteverify` com a secret key
 * (`server/utils/gestao-captcha.ts`) — conferir só no client é o mesmo que não
 * ter captcha.
 *
 * LGPD (CLAUDE.md): o Turnstile é script de terceiro que recebe dados do
 * visitante (IP, sinais do navegador). Está descrito em `app/pages/privacidade.vue`
 * e vigiado por `privacidade-guardrail.test.ts`.
 */
const modelo = defineModel<string>({ default: '' })

// Com a site key configurada o desafio é o Turnstile de verdade; sem ela, o simulado do demo (abaixo).
// A key é pública por desenho. O token só vale depois do `siteverify` no servidor (`gestao-captcha.ts`).
const siteKey = String(useRuntimeConfig().public.turnstileSiteKey || '')
const real = !!siteKey

interface TurnstileApi {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}
let carregando: Promise<TurnstileApi> | null = null
function carregarTurnstile(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi }
  if (w.turnstile) return Promise.resolve(w.turnstile)
  carregando ??= new Promise<TurnstileApi>((ok, falha) => {
    const el = document.createElement('script')
    el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    el.async = true
    el.onload = () => (w.turnstile ? ok(w.turnstile) : falha(new Error('turnstile')))
    el.onerror = () => {
      carregando = null
      falha(new Error('turnstile'))
    }
    document.head.appendChild(el)
  })
  return carregando
}

const caixa = ref<HTMLElement | null>(null)
const falhouCarregar = ref(false)
let widgetId: string | undefined
let api: TurnstileApi | undefined

async function montarReal() {
  try {
    api = await carregarTurnstile()
  } catch {
    falhouCarregar.value = true
    return
  }
  if (!caixa.value) return
  widgetId = api.render(caixa.value, {
    sitekey: siteKey,
    language: 'pt-br',
    theme: document.documentElement.classList.contains('gestao-escuro') ? 'dark' : 'light',
    callback: (token: string) => (modelo.value = token),
    'expired-callback': () => (modelo.value = ''),
    'error-callback': () => (modelo.value = ''),
  })
}
onMounted(() => {
  if (real) void montarReal()
})

const verificando = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const resolvido = computed(() => !!modelo.value)

function resolver() {
  if (resolvido.value || verificando.value) return
  verificando.value = true
  // A espera existe para a tela mostrar o estado «verificando»; um captcha que
  // resolve instantaneamente esconde os bugs de estado de quem o consome.
  timer = setTimeout(() => {
    const b = crypto.getRandomValues(new Uint8Array(8))
    modelo.value = `demo-${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`
    verificando.value = false
  }, 700)
}

// Token zerado por quem consome (tentativa falhou): o desafio recomeça. Token de
// captcha é de uso único — reaproveitar o da tentativa anterior seria o furo.
watch(modelo, (v) => {
  if (v) return
  verificando.value = false
  // Token de Turnstile também é de uso único: o widget recomeça o desafio.
  if (real && widgetId !== undefined) api?.reset(widgetId)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  if (widgetId !== undefined) api?.remove(widgetId)
})

const status = computed(() =>
  resolvido.value ? 'Verificação concluída.' : verificando.value ? 'Verificando…' : 'Verificação pendente.',
)
</script>

<template>
  <div v-if="real" data-testid="captcha" :data-resolvido="!!modelo" :data-real="true">
    <div ref="caixa" />
    <p v-if="falhouCarregar" role="alert" class="m-0 mt-1 font-semibold text-[var(--danger)]" data-testid="captcha-erro">
      Não foi possível carregar a verificação. Recarregue a página ou tente de novo em instantes.
    </p>
  </div>
  <div
    v-else
    class="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--line-2)] bg-[var(--surface)] px-3.5 py-2"
    data-testid="captcha"
    :data-resolvido="resolvido"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="resolvido"
      :disabled="verificando"
      class="[display:grid] size-11 flex-none cursor-pointer place-items-center rounded-lg border-2 bg-[var(--paper)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:cursor-progress"
      :class="resolvido ? 'border-[var(--ok)] text-[var(--ok)]' : 'border-[var(--ink-soft)]'"
      aria-label="Não sou um robô"
      data-testid="captcha-caixa"
      @click="resolver"
    >
      <svg v-if="resolvido" viewBox="0 0 20 20" class="size-6" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <path d="m4 10.5 4 4 8-9" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <svg v-else-if="verificando" viewBox="0 0 20 20" class="size-5 animate-spin motion-reduce:animate-none" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <path d="M10 2a8 8 0 1 0 8 8" stroke-linecap="round" />
      </svg>
    </button>
    <span class="font-semibold">Não sou um robô</span>
    <span class="ml-auto text-[length:var(--fs-caption)] text-[var(--ink-soft)]" role="status" aria-live="polite">{{ status }}</span>
  </div>
</template>
