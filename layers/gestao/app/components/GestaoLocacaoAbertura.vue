<script setup lang="ts">
import type { DadosAberturaLocacao } from '../../domain/acoes-locacao'
import { IMOVEIS_EXEMPLO } from '../../domain/locacao-seed'
import { CORRETORES } from '../../domain/seed'
import type { Locacao } from '../../domain/types'

const props = defineProps<{ locacao: Locacao; podeEditar: boolean }>()
const emit = defineEmits<{ salvar: [dados: DadosAberturaLocacao] }>()

const locador = reactive({ ...props.locacao.locador })
const locatario = reactive({ ...props.locacao.locatario })
const imovelId = ref(props.locacao.imovelId)
const corretorId = ref(props.locacao.corretorId)

function salvar() {
  const imovel = IMOVEIS_EXEMPLO.find((i) => i.id === imovelId.value)?.rotulo ?? props.locacao.imovel
  emit('salvar', { locador: { ...locador }, locatario: { ...locatario }, imovelId: imovelId.value, imovel, corretorId: corretorId.value })
}

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const botao =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <form class="[display:grid] gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" novalidate @submit.prevent="salvar">
    <h2 class="m-0 text-[length:var(--fs-body)] font-extrabold">Abertura</h2>
    <div class="[display:grid] gap-3 sm:grid-cols-2">
      <label :class="rotulo">Locador (proprietário)<input v-model="locador.nome" :class="campo" :disabled="!podeEditar" autocomplete="off" data-testid="abertura-locador" /></label>
      <label :class="rotulo">CPF ou CNPJ do locador<input v-model="locador.cpf" :class="campo" :disabled="!podeEditar" inputmode="numeric" autocomplete="off" /></label>
      <label :class="rotulo">Locatário (inquilino)<input v-model="locatario.nome" :class="campo" :disabled="!podeEditar" autocomplete="off" data-testid="abertura-locatario" /></label>
      <label :class="rotulo">CPF ou CNPJ do locatário<input v-model="locatario.cpf" :class="campo" :disabled="!podeEditar" inputmode="numeric" autocomplete="off" /></label>
      <label :class="rotulo">
        Imóvel
        <select v-model="imovelId" :class="campo" :disabled="!podeEditar">
          <option v-for="i in IMOVEIS_EXEMPLO" :key="i.id" :value="i.id">{{ i.rotulo }}</option>
        </select>
      </label>
      <label :class="rotulo">
        Corretor
        <select v-model="corretorId" :class="campo" :disabled="!podeEditar">
          <option v-for="c in CORRETORES" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </label>
    </div>
    <div v-if="podeEditar"><button type="submit" :class="botao" data-testid="salvar-abertura">Salvar abertura</button></div>
  </form>
</template>
