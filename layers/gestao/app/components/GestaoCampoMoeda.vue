<script setup lang="ts">
import { mascararMoeda, valorDeColagemMoeda, valorDeTextoMoeda } from '../../domain/moeda'

/**
 * Campo de dinheiro com «R$» fixo e máscara de centavos (regra em
 * `domain/moeda.ts`). O model é número em reais — quem usa não muda nada além
 * de trocar o `<input type="number">` por este componente.
 *
 * Zero aparece vazio com o placeholder «0,00»: num campo opcional (FGTS,
 * recurso próprio) um «0,00» preenchido parece dado informado. `data-testid` e
 * `aria-*` passados ao componente vão para o `<input>`, não para a moldura.
 *
 * O foco é desenhado só na moldura (`focus-within`). O `outline-none!` do input
 * precisa do `!`: o `:focus-visible` global de `app/assets/css/main.css` está
 * fora de camada e vence o utilitário do Tailwind, desenhando um segundo
 * contorno dentro do primeiro. Pelo mesmo motivo o `bg-transparent!`: o tema
 * escuro (`gestao-tema.css`) pinta todo `input` com `--paper`, e sem o `!` o
 * campo virava uma caixa de outra cor dentro da moldura.
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{ disabled?: boolean; required?: boolean; invalido?: boolean }>(), {
  disabled: false,
  required: false,
  invalido: false,
})

const modelo = defineModel<number>({ default: 0 })

const exibe = (v: number) => (v > 0 ? mascararMoeda(v) : '')
const texto = ref(exibe(modelo.value))
watch(modelo, (v) => {
  if (valorDeTextoMoeda(texto.value) !== v) texto.value = exibe(v)
})

function aplicar(el: HTMLInputElement, valor: number) {
  modelo.value = valor
  texto.value = exibe(valor)
  // Força o DOM mesmo quando o texto formatado não mudou (ex.: letra digitada,
  // que a máscara descarta): sem isso a letra ficaria visível no campo.
  el.value = texto.value
  // Na máscara de centavos o número cresce pela direita: o cursor mora no fim.
  const fim = el.value.length
  el.setSelectionRange(fim, fim)
}

function aoDigitar(e: Event) {
  const el = e.target as HTMLInputElement
  aplicar(el, valorDeTextoMoeda(el.value))
}

function aoColar(e: ClipboardEvent) {
  const colado = e.clipboardData?.getData('text') ?? ''
  if (!colado) return
  e.preventDefault()
  aplicar(e.target as HTMLInputElement, valorDeColagemMoeda(colado))
}
</script>

<template>
  <span
    class="flex min-h-11 w-full items-center gap-2 rounded-[10px] border bg-[var(--paper)] px-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--brand)]"
    :class="[
      props.invalido ? 'border-[var(--danger)]' : 'border-[var(--line-2)]',
      props.disabled ? 'bg-[var(--surface)] text-[var(--ink-soft)]' : 'text-[var(--ink)]',
    ]"
  >
    <span aria-hidden="true" class="font-normal text-[var(--ink-soft)]">R$</span>
    <input
      v-bind="$attrs"
      :value="texto"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="0,00"
      :disabled="props.disabled"
      :required="props.required"
      :aria-required="props.required ? 'true' : undefined"
      :aria-invalid="props.invalido ? 'true' : undefined"
      class="min-w-0 flex-1 border-0 bg-transparent! p-0 text-right text-[length:var(--fs-body)] font-normal tabular-nums text-inherit outline-none! placeholder:text-[var(--ink-soft)]"
      @input="aoDigitar"
      @paste="aoColar"
    />
  </span>
</template>
