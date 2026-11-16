<script setup lang="ts">
import { TOM_STATUS_LOCACAO } from '../../domain/locacao-status'
import { TOM_STATUS } from '../../domain/status'
import type { StatusLocacao, StatusVenda, TomStatus } from '../../domain/types'

const props = defineProps<{ status: StatusVenda | StatusLocacao }>()
const tom = computed<TomStatus>(
  () => TOM_STATUS[props.status as StatusVenda] ?? TOM_STATUS_LOCACAO[props.status as StatusLocacao] ?? 'neutral',
)

// Pares texto/fundo escolhidos para ≥ 4,5:1 (WCAG AA). Classes completas, não
// montadas por string: o Tailwind só gera o que aparece escrito no arquivo.
const TONS: Record<TomStatus, string> = {
  neutral: 'bg-[#e7e9e6] text-[#2b2f33]',
  blue: 'bg-[#dbeafe] text-[#1e3a8a]',
  amber: 'bg-[#fef3c7] text-[#78350f]',
  green: 'bg-[#d1fae5] text-[#064e3b]',
  purple: 'bg-[#ede9fe] text-[#4c1d95]',
  red: 'bg-[#fee2e2] text-[#7f1d1d]',
}
</script>

<template>
  <!-- Texto sempre presente: cor sozinha não distingue status (daltonismo). -->
  <span
    class="inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[length:var(--fs-caption)] font-bold"
    :class="TONS[tom]"
    data-testid="status-chip"
  >
    {{ status }}
  </span>
</template>
