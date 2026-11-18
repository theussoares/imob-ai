<template>
  <!-- Barras cinza no formato do cartão real: o branco vazio parecia página quebrada. -->
  <div class="flex h-60 animate-pulse flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-hidden="true">
    <div class="h-4 w-1/3 rounded bg-[var(--line)]" />
    <div class="h-6 w-4/5 rounded bg-[var(--line)]" />
    <div class="h-4 w-2/3 rounded bg-[var(--line)]" />
    <div class="mt-auto flex gap-2">
      <div class="h-6 w-20 rounded-full bg-[var(--line)]" />
      <div class="h-6 w-16 rounded-full bg-[var(--line)]" />
    </div>
  </div>
</template>

<style>
@media (prefers-reduced-motion: reduce) {
  .animate-pulse { animation: none; }
}
</style>
