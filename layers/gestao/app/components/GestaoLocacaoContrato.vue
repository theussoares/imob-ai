<script setup lang="ts">
import type { ContratoLocacao } from '../../domain/types'

const props = defineProps<{ contrato?: ContratoLocacao; podeEditar: boolean }>()
const emit = defineEmits<{ salvar: [dados: ContratoLocacao] }>()

const form = reactive<ContratoLocacao>({
  valor: props.contrato?.valor ?? 0,
  diaVencimento: props.contrato?.diaVencimento ?? 10,
  inicio: props.contrato?.inicio ?? '',
  fim: props.contrato?.fim ?? '',
  reajuste: props.contrato?.reajuste ?? 'IGP-M',
  taxaPct: props.contrato?.taxaPct ?? 10,
})

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const botao =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <form class="[display:grid] gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" novalidate @submit.prevent="emit('salvar', { ...form })">
    <h2 class="m-0 text-[length:var(--fs-body)] font-extrabold">Contrato e aluguel</h2>
    <div class="[display:grid] gap-3 sm:grid-cols-3">
      <label :class="rotulo">Valor do aluguel (R$)<input v-model.number="form.valor" type="number" min="0" step="0.01" :class="campo" :disabled="!podeEditar" data-testid="contrato-valor" /></label>
      <label :class="rotulo">Dia de vencimento (1 a 28)<input v-model.number="form.diaVencimento" type="number" min="1" max="28" :class="campo" :disabled="!podeEditar" data-testid="contrato-dia" /></label>
      <label :class="rotulo">Taxa da imobiliária (%)<input v-model.number="form.taxaPct" type="number" min="0" max="100" step="0.1" :class="campo" :disabled="!podeEditar" data-testid="contrato-taxa" /></label>
      <label :class="rotulo">Início<input v-model="form.inicio" type="date" :class="campo" :disabled="!podeEditar" data-testid="contrato-inicio" /></label>
      <label :class="rotulo">Fim<input v-model="form.fim" type="date" :class="campo" :disabled="!podeEditar" data-testid="contrato-fim" /></label>
      <label :class="rotulo">
        Reajuste
        <select v-model="form.reajuste" :class="campo" :disabled="!podeEditar">
          <option>IGP-M</option>
          <option>IPCA</option>
          <option>Outro</option>
        </select>
      </label>
    </div>
    <div v-if="podeEditar"><button type="submit" :class="botao" data-testid="salvar-contrato">Salvar contrato</button></div>
  </form>
</template>
