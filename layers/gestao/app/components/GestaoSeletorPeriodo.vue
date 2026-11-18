<script setup lang="ts">
import { ATALHOS_PERIODO, atalhoDoPeriodo, periodoDoAtalho, textoPeriodo, type AtalhoPeriodo } from '../../domain/periodo'

/**
 * Seletor de período: um botão que abre um popover com atalhos e datas livres.
 * Edita `de`/`ate` (ISO, '' = sem limite) direto no v-model, sem formato próprio —
 * quem consome continua enviando os mesmos parâmetros de antes.
 */
const de = defineModel<string>('de', { default: '' })
const ate = defineModel<string>('ate', { default: '' })
defineProps<{ rotulo?: string; testid?: string }>()

const aberto = ref(false)
const raiz = ref<HTMLElement | null>(null)
const botao = ref<HTMLButtonElement | null>(null)
const painel = ref<HTMLElement | null>(null)
const id = useId()

const texto = computed(() => textoPeriodo({ de: de.value, ate: ate.value }))
const ativo = computed(() => atalhoDoPeriodo({ de: de.value, ate: ate.value }))

const aplicar = (a: AtalhoPeriodo) => {
  const p = periodoDoAtalho(a)
  de.value = p.de
  ate.value = p.ate
  fechar()
}
const limpar = () => {
  de.value = ''
  ate.value = ''
  fechar()
}

async function abrir() {
  aberto.value = true
  await nextTick()
  painel.value?.querySelector<HTMLElement>('button, input')?.focus()
}
// Foco volta ao botão: quem navega por teclado não pode ficar perdido no <body>.
function fechar() {
  if (!aberto.value) return
  aberto.value = false
  botao.value?.focus()
}
const alternar = () => (aberto.value ? fechar() : abrir())

// Clique fora fecha sem roubar o foco do que a pessoa clicou.
function fora(e: MouseEvent) {
  if (aberto.value && raiz.value && !raiz.value.contains(e.target as Node)) aberto.value = false
}
onMounted(() => document.addEventListener('mousedown', fora))
onBeforeUnmount(() => document.removeEventListener('mousedown', fora))

const campo =
  'min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const atalho =
  'min-h-11 cursor-pointer rounded-[10px] border px-3 text-left text-[length:var(--fs-ui)] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
</script>

<template>
  <div ref="raiz" class="relative [display:grid] gap-1" @keydown.esc.stop="fechar">
    <span :id="`${id}-r`" class="text-[length:var(--fs-label)] font-semibold">{{ rotulo ?? 'Período' }}</span>
    <button
      ref="botao"
      type="button"
      :class="[campo, 'min-w-56 cursor-pointer text-left']"
      aria-haspopup="dialog"
      :aria-expanded="aberto"
      :aria-controls="`${id}-p`"
      :aria-labelledby="`${id}-r ${id}-b`"
      :data-testid="testid"
      @click="alternar"
    >
      <span :id="`${id}-b`">{{ texto }}</span>
    </button>

    <div
      v-if="aberto"
      :id="`${id}-p`"
      ref="painel"
      role="dialog"
      :aria-labelledby="`${id}-r`"
      class="absolute top-full left-0 z-20 mt-1 [display:grid] w-72 max-w-[calc(100vw-2rem)] gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-3 shadow-lg"
    >
      <div class="[display:grid] gap-2">
        <button
          v-for="a in ATALHOS_PERIODO"
          :key="a.id"
          type="button"
          :class="[atalho, ativo === a.id ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--line-2)] text-[var(--ink)]']"
          :aria-pressed="ativo === a.id"
          :data-testid="`periodo-${a.id}`"
          @click="aplicar(a.id)"
        >
          {{ a.rotulo }}
        </button>
      </div>
      <fieldset class="[display:grid] gap-2 border-0 border-t border-[var(--line)] p-0 pt-3">
        <legend class="float-left mb-2 w-full p-0 text-[length:var(--fs-label)] font-bold text-[var(--ink-soft)]">Personalizado</legend>
        <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
          De
          <input v-model="de" type="date" :max="ate || undefined" :class="campo" data-testid="aud-de" />
        </label>
        <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
          Até
          <input v-model="ate" type="date" :min="de || undefined" :class="campo" data-testid="aud-ate" />
        </label>
      </fieldset>
      <div class="flex justify-between gap-2">
        <button type="button" class="min-h-11 cursor-pointer font-bold text-[var(--brand)] underline" data-testid="periodo-limpar" @click="limpar">Limpar</button>
        <button type="button" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-black" data-testid="periodo-ok" @click="fechar">Pronto</button>
      </div>
    </div>
  </div>
</template>
