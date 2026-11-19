<script setup lang="ts">
import type { Vistoria } from '../../domain/types'

const props = defineProps<{ titulo: string; vistoria?: Vistoria; podeEditar: boolean; demo?: boolean }>()
const emit = defineEmits<{ salvar: [vistoria: Vistoria] }>()

const data = ref(props.vistoria?.data ?? '')
const responsavel = ref(props.vistoria?.responsavel ?? '')
const observacao = ref(props.vistoria?.observacao ?? '')
const fotos = ref<string[]>([...(props.vistoria?.fotos ?? [])])

// O demo guarda só o nome da foto (sem binário), como os documentos.
function escolheu(e: Event) {
  const input = e.target as HTMLInputElement
  fotos.value.push(...Array.from(input.files ?? [], (f) => f.name))
  input.value = ''
}
const exemplo = () => fotos.value.push(`foto-${fotos.value.length + 1}.jpg`)
const tirar = (i: number) => fotos.value.splice(i, 1)

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const botao =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <form
    class="[display:grid] gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"
    novalidate
    @submit.prevent="emit('salvar', { data, responsavel, observacao, fotos: [...fotos] })"
  >
    <h2 class="m-0 text-[length:var(--fs-body)] font-bold">{{ titulo }}</h2>
    <div class="[display:grid] gap-3 sm:grid-cols-2">
      <label :class="rotulo">Data<input v-model="data" type="date" :class="campo" :disabled="!podeEditar" data-testid="vistoria-data" /></label>
      <label :class="rotulo">Responsável<input v-model="responsavel" :class="campo" :disabled="!podeEditar" autocomplete="off" data-testid="vistoria-responsavel" /></label>
    </div>
    <label :class="rotulo">Observações<textarea v-model="observacao" :class="campo" rows="3" :disabled="!podeEditar" /></label>
    <ul class="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="vistoria-fotos">
      <li v-for="(f, i) in fotos" :key="f + i" class="inline-flex items-center gap-2 rounded-full bg-[#e7e9e6] px-3 py-1 text-[length:var(--fs-caption)] font-bold text-[#2b2f33]">
        {{ f }}
        <button v-if="podeEditar" type="button" class="min-h-6 cursor-pointer font-bold" :aria-label="`Remover ${f}`" @click="tirar(i)">×</button>
      </li>
      <li v-if="!fotos.length" class="text-[var(--ink-soft)]">Nenhuma foto anexada.</li>
    </ul>
    <div v-if="podeEditar" class="flex flex-wrap gap-2">
      <label class="inline-flex min-h-11 cursor-pointer items-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 font-bold hover:bg-[var(--brand-ghost)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]">
        Anexar fotos
        <input type="file" class="sr-only" accept="image/*" multiple data-testid="vistoria-arquivo" @change="escolheu" />
      </label>
      <button v-if="demo" type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 font-bold hover:bg-[var(--brand-ghost)]" data-testid="vistoria-exemplo" @click="exemplo">Anexar foto de exemplo</button>
      <button type="submit" :class="botao" data-testid="salvar-vistoria">Salvar vistoria</button>
    </div>
  </form>
</template>
