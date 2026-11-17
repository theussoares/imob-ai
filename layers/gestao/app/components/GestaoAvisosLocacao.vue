<script setup lang="ts">
import type { AvisoLocacao, NivelAviso } from '../../domain/avisos-locacao'

// `compacto` é o selo do card (só o aviso mais grave); sem ele, a lista completa da tela
// da locação. O rótulo em texto (Aviso, Atenção, Urgente, Vencido) existe porque a cor
// sozinha não distingue nível para quem tem daltonismo.
defineProps<{ avisos: AvisoLocacao[]; compacto?: boolean }>()

const ROTULO: Record<NivelAviso, string> = { info: 'Aviso', atencao: 'Atenção', urgente: 'Urgente', vencido: 'Vencido' }
// Pares texto/fundo ≥ 4,5:1, como no `GestaoStatusChip`.
const TONS: Record<NivelAviso, string> = {
  info: 'bg-[#dbeafe] text-[#1e3a8a]',
  atencao: 'bg-[#fef3c7] text-[#78350f]',
  urgente: 'bg-[#ffedd5] text-[#7c2d12]',
  vencido: 'bg-[#fee2e2] text-[#7f1d1d]',
}
</script>

<template>
  <p
    v-if="compacto && avisos.length"
    class="m-0 rounded-lg px-3 py-2 text-[length:var(--fs-caption)] font-bold"
    :class="TONS[avisos[0]!.nivel]"
    data-testid="aviso-card"
  >
    {{ ROTULO[avisos[0]!.nivel] }}: {{ avisos[0]!.texto }}
    <span v-if="avisos.length > 1" class="font-semibold"> (+{{ avisos.length - 1 }})</span>
  </p>

  <ul v-else-if="!compacto && avisos.length" class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Avisos da locação" data-testid="avisos-locacao">
    <li
      v-for="a in avisos"
      :key="a.tipo + a.texto"
      class="rounded-[10px] px-3 py-2 font-semibold"
      :class="TONS[a.nivel]"
      :data-nivel="a.nivel"
      data-testid="aviso"
    >
      <strong>{{ ROTULO[a.nivel] }}:</strong> {{ a.texto }}
    </li>
  </ul>
</template>
