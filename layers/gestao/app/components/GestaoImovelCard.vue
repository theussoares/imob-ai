<script setup lang="ts">
import { ROTULO_FINALIDADE, ROTULO_SITUACAO_IMOVEL, ROTULO_STATUS_IMOVEL, rotuloTipoImovel, type SituacaoImovel } from '../../domain/imoveis'
import type { ImovelDaLista } from '../../domain/imoveis-lista'

const props = defineProps<{ imovel: ImovelDaLista; corretor: string }>()

const TOM_SITUACAO: Record<SituacaoImovel, string> = {
  disponivel: 'bg-[#d1fae5] text-[#064e3b]',
  'em-locacao': 'bg-[#dbeafe] text-[#1e3a8a]',
  'em-venda': 'bg-[#fef3c7] text-[#78350f]',
  vendido: 'bg-[#e5e7eb] text-[#1f2937]',
}
const preco = computed(
  () => `${props.imovel.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}${props.imovel.purpose === 'aluguel' ? '/mês' : ''}`,
)
const capa = computed(() => {
  const c = props.imovel.images.find((f) => f.isCover) ?? props.imovel.images[0]
  return c ? (c.urlSm ?? c.url) : null
})
</script>

<template>
  <li class="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-[0_1px_2px_rgba(20,22,26,0.05)]" data-testid="imovel-card">
    <NuxtLink :to="`/gestao/imoveis/${props.imovel.id}`" class="flex gap-3 p-3 text-inherit no-underline hover:bg-[var(--paper-2)]">
      <img v-if="capa" :src="capa" :alt="`Capa de ${props.imovel.title}`" class="size-24 shrink-0 rounded-lg object-cover" />
      <span v-else class="flex size-24 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--line-2)]" role="img" aria-label="Sem foto">
        <svg class="size-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 3l9 8M5 10v10h14V10M10 20v-5h4v5" /></svg>
      </span>
      <span class="flex min-w-0 flex-col gap-1">
        <strong class="truncate text-[length:var(--fs-body)]">{{ props.imovel.title }}</strong>
        <span class="text-[var(--ink-soft)]">{{ props.imovel.neighborhood }} · {{ rotuloTipoImovel(props.imovel.type) }} · {{ ROTULO_FINALIDADE[props.imovel.purpose] }}</span>
        <span class="font-bold">{{ preco }}</span>
        <span class="flex flex-wrap gap-1.5 text-[length:var(--fs-caption)] font-bold">
          <span class="rounded-full bg-[var(--paper-2)] px-2.5 py-1" data-testid="imovel-status-selo">{{ ROTULO_STATUS_IMOVEL[props.imovel.status] }}</span>
          <span class="rounded-full px-2.5 py-1" :class="TOM_SITUACAO[props.imovel.situacao]" data-testid="imovel-situacao">{{ ROTULO_SITUACAO_IMOVEL[props.imovel.situacao] }}</span>
        </span>
        <span v-if="props.corretor" class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">Corretor: {{ props.corretor }}</span>
      </span>
    </NuxtLink>
  </li>
</template>
