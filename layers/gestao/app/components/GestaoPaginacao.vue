<script setup lang="ts">
/**
 * «Anterior · Página X de Y · Próxima». Sem lista de números: a lista pode ter dezenas de páginas e
 * em telefone ela não cabe. Quem emite é o pai (a URL é dele); aqui só botões.
 */
const props = defineProps<{ pagina: number; paginas: number; total: number; rotulo: string }>()
defineEmits<{ ir: [pagina: number] }>()

const btn =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold text-[var(--ink)] hover:bg-[var(--brand-ghost)] disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <nav v-if="props.paginas > 1" class="flex flex-wrap items-center justify-between gap-3" :aria-label="`Paginação de ${props.rotulo}`" data-testid="paginacao">
    <button type="button" :class="btn" :disabled="props.pagina <= 1" data-testid="pagina-anterior" @click="$emit('ir', props.pagina - 1)">Anterior</button>
    <p class="m-0 text-[var(--ink-soft)]" aria-live="polite" data-testid="pagina-atual">
      Página {{ props.pagina }} de {{ props.paginas }} · {{ props.total }} {{ props.rotulo }}
    </p>
    <button type="button" :class="btn" :disabled="props.pagina >= props.paginas" data-testid="pagina-proxima" @click="$emit('ir', props.pagina + 1)">Próxima</button>
  </nav>
</template>
