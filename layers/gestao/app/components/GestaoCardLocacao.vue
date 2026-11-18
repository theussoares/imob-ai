<script setup lang="ts">
import { TOTAL_ETAPAS_LOCACAO } from '../../domain/locacao-status'
import { avisosLocacao, hojeISO } from '../../domain/avisos-locacao'
import type { Locacao } from '../../domain/types'

const props = defineProps<{ locacao: Locacao; corretor: string }>()
const feitas = computed(() => props.locacao.concluidas.filter(Boolean).length)
const avisos = computed(() => avisosLocacao(props.locacao, hojeISO()))
</script>

<template>
  <article
    class="flex flex-col gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-4"
    data-testid="card-locacao"
    :data-locacao-id="locacao.id"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <strong class="text-[length:var(--fs-ui)]">{{ locacao.id }}</strong>
      <GestaoStatusChip :status="locacao.status" />
    </header>

    <h2 class="text-[length:var(--fs-title-sm)] leading-snug font-bold">
      {{ locacao.locador.nome }} e {{ locacao.locatario.nome }}
    </h2>

    <dl class="[display:grid] grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-[length:var(--fs-ui)]">
      <dt class="text-[var(--ink-soft)]">Locador</dt>
      <dd class="min-w-0 break-words font-semibold">{{ locacao.locador.nome }}</dd>
      <dt class="text-[var(--ink-soft)]">Locatário</dt>
      <dd class="min-w-0 break-words font-semibold">{{ locacao.locatario.nome }}</dd>
      <dt class="text-[var(--ink-soft)]">Imóvel</dt>
      <dd class="min-w-0 break-words">{{ locacao.imovel }}</dd>
      <dt class="text-[var(--ink-soft)]">Corretor</dt>
      <dd class="min-w-0 break-words">{{ corretor }}</dd>
      <dt class="text-[var(--ink-soft)]">Atualizado</dt>
      <dd>{{ locacao.updated }}</dd>
    </dl>

    <GestaoAvisosLocacao :avisos="avisos" compacto />

    <p class="rounded-lg bg-[#e7e9e6] px-3 py-2 text-[length:var(--fs-caption)] font-bold text-[#2b2f33]">
      {{ feitas }} de {{ TOTAL_ETAPAS_LOCACAO }} etapas concluídas
    </p>

    <NuxtLink
      :to="`/gestao/locacao/${locacao.id}`"
      class="mt-auto inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)]! no-underline hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
    >
      Abrir locação
    </NuxtLink>
  </article>
</template>
