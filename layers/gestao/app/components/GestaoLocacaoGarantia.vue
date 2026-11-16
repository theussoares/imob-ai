<script setup lang="ts">
import type { Locacao, TipoGarantia } from '../../domain/types'

const TIPOS: TipoGarantia[] = ['Caução', 'Seguro-fiança', 'Fiador', 'Título de capitalização', 'Outra']

const props = defineProps<{ locacao: Locacao; podeEditar: boolean }>()
const emit = defineEmits<{ salvar: [dados: { tipo: TipoGarantia; detalhe: string }] }>()

const tipo = ref<TipoGarantia>(props.locacao.garantia?.tipo ?? 'Caução')
const detalhe = ref(props.locacao.garantia?.detalhe ?? '')

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const botao =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <form class="[display:grid] gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" novalidate @submit.prevent="emit('salvar', { tipo, detalhe })">
    <h2 class="m-0 text-[length:var(--fs-body)] font-extrabold">Garantia</h2>
    <div class="[display:grid] gap-3 sm:grid-cols-2">
      <label :class="rotulo">
        Tipo
        <select v-model="tipo" :class="campo" :disabled="!podeEditar" data-testid="garantia-tipo">
          <option v-for="t in TIPOS" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label :class="rotulo">Detalhes (valor, apólice, fiador…)<input v-model="detalhe" :class="campo" :disabled="!podeEditar" autocomplete="off" data-testid="garantia-detalhe" /></label>
    </div>
    <div v-if="podeEditar"><button type="submit" :class="botao" data-testid="salvar-garantia">Salvar garantia</button></div>
  </form>
</template>
