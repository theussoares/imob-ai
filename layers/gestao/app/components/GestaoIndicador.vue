<script setup lang="ts">
// Número grande com legenda: usado no Financeiro e no Dashboard. `alerta` marca o que
// pede ação (atraso, repasse pendente) com borda e texto, não só com cor.
defineProps<{ rotulo: string; valor: string; detalhe?: string; alerta?: boolean; testid?: string; to?: string }>()
</script>

<template>
  <component
    :is="to ? 'NuxtLink' : 'div'"
    :to="to"
    class="flex flex-col gap-1 rounded-[14px] border bg-[var(--paper)] p-4 text-[var(--ink)] no-underline"
    :class="alerta ? 'border-[#b91c1c]' : 'border-[var(--line)]'"
    :data-testid="testid"
  >
    <span class="text-[length:var(--fs-label)] font-semibold text-[var(--ink-soft)]">{{ rotulo }}</span>
    <strong class="text-[length:var(--fs-title)] leading-tight font-bold" :class="alerta ? 'text-[#7f1d1d]' : ''">{{ valor }}</strong>
    <span v-if="detalhe" class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]">{{ detalhe }}</span>
  </component>
</template>
