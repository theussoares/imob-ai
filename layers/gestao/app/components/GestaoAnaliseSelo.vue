<script setup lang="ts">
import { ROTULO_ANALISE } from '../../domain/analise-financeira'
import type { StatusAnaliseFin } from '../../domain/types'

defineProps<{ status: StatusAnaliseFin }>()

// Pares texto/fundo ≥ 4,5:1, como no chip de status. O texto e o símbolo dizem o estado: cor sozinha não basta.
const TONS: Record<StatusAnaliseFin, string> = {
  rascunho: 'bg-[#e7e9e6] text-[#2b2f33]',
  'em-analise': 'bg-[#fef3c7] text-[#78350f]',
  aprovado: 'bg-[#d1fae5] text-[#064e3b]',
  devolvido: 'bg-[#fee2e2] text-[#7f1d1d]',
}
const SIMBOLO: Record<StatusAnaliseFin, string> = { rascunho: '✎', 'em-analise': '⏳', aprovado: '✓', devolvido: '↩' }
</script>

<template>
  <span
    class="inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[length:var(--fs-caption)] font-bold"
    :class="TONS[status]"
    data-testid="analise-selo"
  >
    <span aria-hidden="true">{{ SIMBOLO[status] }}</span>
    Financeiro: {{ ROTULO_ANALISE[status] }}
  </span>
</template>
