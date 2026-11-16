<script setup lang="ts">
import type { Pessoa } from '../../domain/types'

const props = defineProps<{ titulo: string; pessoa: Pessoa; podeEditar: boolean }>()
const emit = defineEmits<{ salvar: [pessoa: Pessoa] }>()

const form = reactive({ ...props.pessoa })

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const botao =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <form class="[display:grid] gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" novalidate @submit.prevent="emit('salvar', { ...form })">
    <h2 class="m-0 text-[length:var(--fs-body)] font-extrabold">{{ titulo }}</h2>
    <div class="[display:grid] gap-3 sm:grid-cols-3">
      <label :class="rotulo">CPF ou CNPJ<input v-model="form.cpf" :class="campo" :disabled="!podeEditar" inputmode="numeric" autocomplete="off" data-testid="pessoa-cpf" /></label>
      <label :class="rotulo">Telefone<input v-model="form.telefone" :class="campo" :disabled="!podeEditar" type="tel" autocomplete="off" data-testid="pessoa-telefone" /></label>
      <label :class="rotulo">E-mail<input v-model="form.email" :class="campo" :disabled="!podeEditar" type="email" autocomplete="off" data-testid="pessoa-email" /></label>
    </div>
    <div v-if="podeEditar"><button type="submit" :class="botao" data-testid="salvar-pessoa">Salvar cadastro</button></div>
  </form>
</template>
