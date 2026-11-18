<script setup lang="ts">
import { ETAPAS_VENDA } from '../../domain/status'

const props = defineProps<{
  /** nomes das etapas; sem isto, as 8 da venda */
  nomes?: readonly string[]
  /** etapa que o usuário está olhando (1..8) */
  vista: number
  /** etapa em que o processo está de fato */
  atual: number
  concluidas: boolean[]
}>()
const emit = defineEmits<{ ir: [etapa: number] }>()
</script>

<template>
  <!--
    Rolável no mobile: 8 etapas não cabem em 375px e quebrar em várias linhas
    esconderia a ordem. `min-w-max` mantém o passo com largura própria. No desktop
    há espaço: 8 colunas iguais, e o nome da etapa quebra em duas linhas em vez de
    abreviar («Documentos», nunca «Docs»).
  -->
  <nav aria-label="Etapas do processo" class="overflow-x-auto pb-1" data-testid="stepper">
    <ol class="m-0 flex min-w-max list-none gap-2 p-0 lg:min-w-0 lg:[display:grid] lg:grid-cols-8">
      <li v-for="(nome, i) in props.nomes ?? ETAPAS_VENDA" :key="nome" class="lg:min-w-0">
        <button
          type="button"
          :data-testid="`etapa-${i + 1}`"
          :aria-current="vista === i + 1 ? 'step' : undefined"
          class="flex min-h-11 min-w-32 cursor-pointer lg:h-full lg:w-full lg:min-w-0 flex-col items-start justify-center rounded-[10px] border px-3 py-1.5 text-left"
          :class="
            vista === i + 1
              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--on-brand)]'
              : 'border-[var(--line-2)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--brand-ghost)]'
          "
          @click="emit('ir', i + 1)"
        >
          <span class="text-[length:var(--fs-caption)] font-bold">
            <span v-if="concluidas[i]" aria-hidden="true">✓ </span>Etapa {{ i + 1 }}
          </span>
          <span class="max-w-full text-[length:var(--fs-ui)] font-semibold leading-tight break-words">{{ nome }}</span>
          <!-- Estado em texto: cor/ícone sozinhos não bastam (daltonismo, leitor de tela). -->
          <span
            class="text-[length:var(--fs-caption)]"
            :class="vista === i + 1 ? 'text-[var(--on-brand)] opacity-85' : 'text-[var(--ink-soft)]'"
          >
            {{ concluidas[i] ? 'concluída' : i + 1 === atual ? 'em andamento' : 'pendente' }}
          </span>
        </button>
      </li>
    </ol>
  </nav>
</template>
