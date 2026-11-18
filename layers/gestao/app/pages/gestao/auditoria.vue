<script setup lang="ts">
import {
  eventosAuditoria,
  FILTRO_AUDITORIA_VAZIO,
  filtrarAuditoria,
  pessoasDaAuditoria,
  type FiltroAuditoria,
} from '../../../domain/auditoria'

// Rota estática: vence `[secao].vue`. A guarda do middleware já barra quem não tem `auditoria`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Histórico de alterações · Gestão' })

const store = useGestaoStore()
await store.carregar()

// Todos os contratos, inclusive arquivados: `store.processos` e `store.locacoes` não filtram.
const todos = computed(() => eventosAuditoria(store.processos.value, store.locacoes.value))
const pessoas = computed(() => pessoasDaAuditoria(todos.value))

const filtro = reactive<FiltroAuditoria>({ ...FILTRO_AUDITORIA_VAZIO })
const lista = computed(() => filtrarAuditoria(todos.value, filtro))
const limpar = () => Object.assign(filtro, FILTRO_AUDITORIA_VAZIO)

const href = (e: { tipo: string; contratoId: string }) =>
  e.tipo === 'venda' ? `/gestao/vendas/${e.contratoId}` : `/gestao/locacao/${e.contratoId}`

const campo =
  'min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const th = 'px-3 py-2 text-left text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]'
const td = 'px-3 py-2 align-top text-[length:var(--fs-ui)]'
</script>

<template>
  <section class="[display:grid] gap-4">
    <header>
      <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-bold">Histórico de alterações</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Quem fez o quê, em vendas e locações, inclusive nos contratos arquivados.</p>
    </header>

    <div class="flex flex-wrap items-end gap-3">
      <label class="[display:grid] min-w-56 flex-1 gap-1 text-[length:var(--fs-label)] font-semibold">
        Buscar
        <input v-model="filtro.q" type="search" :class="campo" placeholder="Contrato, imóvel, ação ou pessoa" autocomplete="off" data-testid="aud-busca" />
      </label>
      <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
        Pessoa
        <select v-model="filtro.quem" :class="campo" data-testid="aud-quem">
          <option value="">Todas</option>
          <option v-for="p in pessoas" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
      <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
        Tipo
        <select v-model="filtro.tipo" :class="campo" data-testid="aud-tipo">
          <option value="">Vendas e locações</option>
          <option value="venda">Vendas</option>
          <option value="locacao">Locações</option>
        </select>
      </label>
      <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
        De
        <input v-model="filtro.de" type="date" :class="campo" data-testid="aud-de" />
      </label>
      <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
        Até
        <input v-model="filtro.ate" type="date" :class="campo" data-testid="aud-ate" />
      </label>
      <p class="min-h-11 content-center text-[var(--ink-soft)]" aria-live="polite" data-testid="aud-total">
        {{ lista.length }} {{ lista.length === 1 ? 'registro' : 'registros' }}
      </p>
    </div>

    <p
      v-if="!lista.length"
      class="m-0 rounded-[14px] border border-dashed border-[var(--line-2)] bg-[var(--paper)] p-5 text-[var(--ink-soft)]"
      data-testid="aud-vazio"
    >
      Nenhum registro para esse filtro.
      <button type="button" class="ml-2 cursor-pointer font-bold text-[var(--brand)] underline" @click="limpar">Limpar filtros</button>
    </p>

    <div v-else class="overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--paper)]">
      <table class="w-full border-collapse" data-testid="aud-tabela">
        <caption class="sr-only">Eventos registrados, do mais recente ao mais antigo</caption>
        <thead>
          <tr>
            <th :class="th">Quando</th>
            <th :class="th">Pessoa</th>
            <th :class="th">Ação</th>
            <th :class="th">Contrato</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in lista" :key="e.contratoId + e.chave + i" class="border-t border-[var(--line)]" data-testid="aud-linha">
            <td :class="td" class="whitespace-nowrap">{{ e.quando }}</td>
            <td :class="td">{{ e.quem }}</td>
            <td :class="td">{{ e.acao }}</td>
            <td :class="td">
              <NuxtLink :to="href(e)" class="font-bold text-[var(--brand)]">{{ e.contratoId }}</NuxtLink>
              <span v-if="e.arquivado" class="ml-1 text-[length:var(--fs-caption)] text-[var(--ink-soft)]">(arquivado)</span>
              <div class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]">{{ e.imovel }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
