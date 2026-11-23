<script setup lang="ts">
// Dumb: o estado aberto/fechado é de quem usa (`v-model:aberto`), porque o formulário abre blocos com erro e tem «expandir tudo».
interface Props {
  id: string
  titulo: string
  /** Linha à direita do título, só com o bloco fechado. */
  resumo?: string
  /** Aviso em destaque (ex.: «2 campos a corrigir»), visível aberto ou fechado. */
  selo?: string
}
const props = defineProps<Props>()
const aberto = defineModel<boolean>('aberto', { default: false })
</script>

<template>
  <section class="rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-[0_1px_2px_rgba(20,22,26,0.05)]" :data-testid="`acordeao-${props.id}`">
    <h2 class="m-0 text-[length:var(--fs-body)] font-bold">
      <button
        :id="`${props.id}-cabecalho`"
        type="button"
        class="flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent px-4 text-left font-[inherit] text-[length:inherit] font-bold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand)] md:px-5"
        :aria-expanded="aberto"
        :aria-controls="`${props.id}-corpo`"
        @click="aberto = !aberto"
      >
        <span aria-hidden="true" class="inline-block size-2.5 shrink-0 border-r-2 border-b-2 border-[var(--ink-soft)] transition-transform" :class="aberto ? 'rotate-45' : '-rotate-45'" />
        <span>{{ props.titulo }}</span>
        <span v-if="props.selo" class="rounded-full bg-[var(--danger-ghost)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold text-[var(--danger)]" data-testid="acordeao-selo">{{ props.selo }}</span>
        <span v-if="!aberto && props.resumo" class="ml-auto min-w-0 truncate text-[length:var(--fs-label)] font-medium text-[var(--ink-soft)]">{{ props.resumo }}</span>
      </button>
    </h2>
    <!-- v-show e não v-if: os campos seguem montados (v-model, validação e foco por id continuam valendo). -->
    <div v-show="aberto" :id="`${props.id}-corpo`" role="region" :aria-labelledby="`${props.id}-cabecalho`" class="border-t border-[var(--line)] p-4 md:p-5">
      <slot />
    </div>
  </section>
</template>
