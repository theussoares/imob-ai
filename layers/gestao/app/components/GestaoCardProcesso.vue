<script setup lang="ts">
import { statusFinal } from '../../domain/status'
import type { Processo } from '../../domain/types'

const props = defineProps<{
  processo: Processo
  corretor: string
  pendencias: number
}>()

// Cancelada não precisa mais de contrato: o selo viraria ruído num card encerrado.
const final = computed(() => statusFinal(props.processo.status))
const semContrato = computed(() => !props.processo.pdf && props.processo.status !== 'Venda cancelada')
</script>

<template>
  <article
    class="flex flex-col gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-4"
    data-testid="card-processo"
    :data-processo-id="processo.id"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <strong class="text-[length:var(--fs-ui)]">{{ processo.id }}</strong>
      <GestaoStatusChip :status="processo.status" />
    </header>
    <!-- Só o que pede ação de alguém: em análise (para quem analisa) e devolvido (para o corretor). -->
    <GestaoAnaliseSelo v-if="processo.analiseFin && (processo.analiseFin.status === 'em-analise' || processo.analiseFin.status === 'devolvido')" :status="processo.analiseFin.status" />

    <h2 class="text-[length:var(--fs-title-sm)] leading-snug font-bold" data-testid="card-titulo">
      {{ processo.vendedor.nome }} e {{ processo.comprador.nome }}
    </h2>

    <dl class="[display:grid] grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-[length:var(--fs-ui)]">
      <dt class="text-[var(--ink-soft)]">Vendedor</dt>
      <dd class="min-w-0 break-words font-semibold">{{ processo.vendedor.nome }}</dd>
      <dt class="text-[var(--ink-soft)]">Comprador</dt>
      <dd class="min-w-0 break-words font-semibold">{{ processo.comprador.nome }}</dd>
      <dt class="text-[var(--ink-soft)]">Imóvel</dt>
      <dd class="min-w-0 break-words">{{ processo.imovel }}</dd>
      <dt class="text-[var(--ink-soft)]">Corretor</dt>
      <dd class="min-w-0 break-words">{{ corretor }}</dd>
      <dt class="text-[var(--ink-soft)]">Atualizado</dt>
      <dd>{{ processo.updated }}</dd>
    </dl>

    <!-- Três linhas e não o texto inteiro: um acordo longo esticaria o card e desalinharia a grade.
         O texto completo fica na aba Observações e no `title`. -->
    <div v-if="processo.anotacoes" class="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2" data-testid="card-observacoes">
      <p class="text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]">Observações</p>
      <p class="line-clamp-3 break-words whitespace-pre-line text-[length:var(--fs-ui)]" :title="processo.anotacoes">{{ processo.anotacoes }}</p>
    </div>

    <!-- Âmbar sobre fundo claro com texto escuro (≥ 4,5:1), como no chip de status. -->
    <p
      v-if="pendencias > 0"
      class="rounded-lg bg-[#fef3c7] px-3 py-2 text-[length:var(--fs-caption)] font-bold text-[#78350f]"
      data-testid="aviso-pendencias"
    >
      {{ pendencias }} {{ pendencias === 1 ? 'pendência documental' : 'pendências documentais' }}
    </p>
    <p
      v-else-if="!final"
      class="rounded-lg bg-[#d1fae5] px-3 py-2 text-[length:var(--fs-caption)] font-bold text-[#064e3b]"
      data-testid="sem-pendencias"
    >
      Sem pendências documentais
    </p>

    <p
      v-if="semContrato"
      class="rounded-lg bg-[#e7e9e6] px-3 py-2 text-[length:var(--fs-caption)] font-bold text-[#2b2f33]"
      data-testid="sem-contrato-pdf"
    >
      Sem contrato PDF
    </p>

    <NuxtLink
      :to="`/gestao/vendas/${processo.id}`"
      class="mt-auto inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)]! no-underline hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
    >
      Abrir processo
    </NuxtLink>
  </article>
</template>
