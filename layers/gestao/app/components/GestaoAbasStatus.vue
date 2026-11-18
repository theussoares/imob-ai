<script setup lang="ts">
import type { Contagens } from '../../domain/paginacao'
import { abasDeStatus } from '../../domain/paginacao'

/**
 * Abas de status das listas de contratos, com o contador de cada uma. A regra de quais abas aparecem
 * (só status com contagem > 0, mais «Todos» e a ativa) mora em `abasDeStatus`, testada em Node.
 */
const props = defineProps<{
  /** Contagem por status vinda do servidor (já com busca e escopo do perfil). `undefined` enquanto carrega. */
  contagens: Contagens | undefined
  /** Status em ordem de fluxo: define a ordem das abas. */
  ordem: readonly string[]
  /** '' = «Todos». */
  ativo: string
  rotulo: string
}>()
const emit = defineEmits<{ mudar: [status: string] }>()

const abas = computed(() => abasDeStatus(props.contagens, props.ordem, props.ativo))
</script>

<template>
  <!-- `overflow-x-auto` + `shrink-0` nas abas: com até 14 abas, quebrar linha empurraria a lista para baixo
       no celular; rolar na horizontal mantém a barra numa linha só. -->
  <div role="tablist" :aria-label="rotulo" class="flex gap-1 overflow-x-auto border-b border-[var(--line)]" data-testid="filtro-status">
    <button
      v-for="a in abas"
      :key="a.status || 'todos'"
      type="button"
      role="tab"
      :aria-selected="ativo === a.status"
      class="-mb-px inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-b-[3px] px-4 font-semibold whitespace-nowrap"
      :class="ativo === a.status ? 'border-[var(--gestao-amarelo)] text-[var(--ink)]' : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'"
      :data-testid="`aba-status-${a.status || 'todos'}`"
      @click="emit('mudar', a.status)"
    >
      {{ a.status || 'Todos' }}
      <span class="rounded-full bg-[var(--brand-ghost)] px-2 text-[length:var(--fs-label)] font-bold text-[var(--ink)]">{{ a.total }}</span>
    </button>
  </div>
</template>
