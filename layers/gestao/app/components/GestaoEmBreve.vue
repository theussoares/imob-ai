<script setup lang="ts">
defineProps<{ titulo: string; descricao?: string }>()
</script>

<template>
  <section
    class="max-w-140 rounded-xl border border-dashed border-[var(--line-2)] bg-[var(--paper)] p-7"
    data-testid="em-breve"
  >
    <h1 class="mb-2 text-[length:var(--fs-title)] font-bold">{{ titulo }}</h1>
    <p class="mb-4 text-[var(--ink-soft)]">
      {{ descricao || 'Esta seção está no planejamento e não faz parte da demonstração de hoje.' }}
    </p>
    <NuxtLink to="/gestao/vendas" class="inline-flex min-h-11 items-center font-bold text-[var(--brand)]">
      Ir para contratos de venda
    </NuxtLink>
  </section>
</template>
