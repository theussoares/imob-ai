<script setup lang="ts">
import { filtrarProcessos } from '../../../../domain/filtro'
import { documentosPendentes } from '../../../../domain/requisitos'
import { STATUS_VENDA } from '../../../../domain/status'
import type { StatusVenda } from '../../../../domain/types'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })

const store = useGestaoStore()

const q = ref('')
const status = ref<StatusVenda | ''>('')
const falhou = ref(false)
const modal = ref<{ abrir: () => void } | null>(null)

// O layout já espera `carregar()`; este caminho cobre só a falha tardia (ex.:
// «Restaurar dados» refazendo o carregamento) sem deixar a tela muda.
async function carregar() {
  falhou.value = false
  try {
    await store.carregar()
  } catch {
    falhou.value = true
  }
}
onMounted(() => {
  if (!store.carregado.value) carregar()
})

const filtrados = computed(() =>
  filtrarProcessos(store.visiveis.value, { q: q.value, status: status.value }, store.corretores.value),
)

const nomeCorretor = (id: string) => store.corretores.value.find((c) => c.id === id)?.nome ?? '—'

// Pendência = item de documento (etapas 2 a 4) ainda sem arquivo. Os da lixeira
// não contam como enviados: apagar o arquivo reabre a pendência.
const pendencias = computed(() => {
  const docs = store.documentos.value
  return new Map(store.visiveis.value.map((p) => [p.id, documentosPendentes(p, docs)]))
})

function limpar() {
  q.value = ''
  status.value = ''
}

// `[display:grid]` e não `grid`: o main.css do site público define `.grid` própria
// (colunas fixas por breakpoint) e ela vence o utilitário do Tailwind, quebrando
// os formulários em duas colunas. A propriedade arbitrária não usa o nome da classe.
const campo =
  'min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const btn =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold text-[var(--ink)] no-underline hover:bg-[var(--brand-ghost)]'
</script>

<template>
  <section class="[display:grid] gap-4">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[length:var(--fs-title)] leading-tight font-extrabold">Contratos de venda</h1>
        <p class="mt-1 text-[var(--ink-soft)]">Acompanhe cada venda da proposta ao registro.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/gestao/documentos?de=lista" :class="btn">Ver todos os documentos</NuxtLink>
        <button
          v-if="store.caps()?.criar"
          type="button"
          class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90"
          data-testid="novo-processo"
          @click="modal?.abrir()"
        >
          + Novo processo
        </button>
      </div>
    </header>

    <div class="flex flex-wrap items-end gap-3">
      <label class="[display:grid] min-w-56 flex-1 gap-1 text-[length:var(--fs-label)] font-semibold">
        Buscar
        <input
          v-model="q"
          type="search"
          :class="campo"
          placeholder="Nome, CPF, imóvel, corretor ou código"
          autocomplete="off"
          data-testid="busca"
        />
      </label>
      <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
        Status
        <select v-model="status" :class="campo" data-testid="filtro-status">
          <option value="">Todos os status</option>
          <option v-for="s in STATUS_VENDA" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <p v-if="store.carregado.value" class="min-h-11 content-center text-[var(--ink-soft)]" aria-live="polite">
        {{ filtrados.length }} {{ filtrados.length === 1 ? 'contrato' : 'contratos' }}
      </p>
    </div>

    <div
      v-if="falhou"
      role="alert"
      class="[display:grid] justify-items-start gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-5"
    >
      <p class="font-bold">Não foi possível carregar os contratos.</p>
      <button type="button" :class="btn" @click="carregar">Tentar de novo</button>
    </div>

    <div v-else-if="!store.carregado.value" class="[display:grid] gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      <div
        v-for="n in 3"
        :key="n"
        class="h-60 animate-pulse rounded-[14px] border border-[var(--line)] bg-[var(--paper)]"
      />
      <span class="sr-only">Carregando contratos…</span>
    </div>

    <div
      v-else-if="!filtrados.length"
      class="[display:grid] justify-items-start gap-3 rounded-[14px] border border-dashed border-[var(--line-2)] bg-[var(--paper)] p-6"
      data-testid="vazio"
    >
      <p class="font-bold">Nenhum contrato encontrado.</p>
      <p class="text-[var(--ink-soft)]">Ajuste a busca ou o filtro de status.</p>
      <button type="button" :class="btn" @click="limpar">Limpar busca</button>
    </div>

    <div v-else class="[display:grid] gap-3 md:grid-cols-2 xl:grid-cols-3">
      <GestaoCardProcesso
        v-for="p in filtrados"
        :key="p.id"
        :processo="p"
        :corretor="nomeCorretor(p.corretorId)"
        :pendencias="pendencias.get(p.id) ?? 0"
      />
    </div>

    <GestaoNovoProcessoModal ref="modal" />
  </section>
</template>
