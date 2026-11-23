<script setup lang="ts">
import {
  FILTRO_IMOVEIS_VAZIO,
  ROTULO_FINALIDADE,
  ROTULO_SITUACAO_IMOVEL,
  ROTULO_STATUS_IMOVEL,
  STATUS_IMOVEL,
  filtrarImoveis,
  rotuloTipoImovel,
  situacaoImovel,
  type SituacaoImovel,
  type FiltroImoveis,
} from '../../../../domain/imoveis'

// A guarda do middleware já barra quem não tem acesso à seção `imoveis`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Imóveis · Gestão' })

const store = useGestaoStore()
await store.carregar(false, ['base', 'corretores', 'locacoes', 'vendas', 'imoveis'])

const filtro = reactive<FiltroImoveis>({ ...FILTRO_IMOVEIS_VAZIO })
const lista = computed(() => filtrarImoveis(store.imoveisVisiveis.value, store.locacoes.value, filtro, store.processos.value))
const podeCriar = computed(() => store.permissoesDoImovel().criar)

const nomeCorretor = (id: string) => store.corretores.value.find((c) => c.id === id)?.nome ?? '—'
const preco = (valor: number, finalidade: 'venda' | 'aluguel') =>
  `${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}${finalidade === 'aluguel' ? '/mês' : ''}`
const capa = (fotos: { url: string; urlSm: string | null; isCover: boolean }[]) => { const c = fotos.find((f) => f.isCover) ?? fotos[0]; return c ? (c.urlSm ?? c.url) : null }

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const TOM_SITUACAO: Record<SituacaoImovel, string> = {
  disponivel: 'bg-[#d1fae5] text-[#064e3b]',
  'em-locacao': 'bg-[#dbeafe] text-[#1e3a8a]',
  'em-venda': 'bg-[#fef3c7] text-[#78350f]',
  vendido: 'bg-[#e5e7eb] text-[#1f2937]',
}
const filtrosAbertos = ref(false)
const filtrosAtivos = computed(() => [filtro.status, filtro.situacao, filtro.purpose].filter(Boolean).length)
// `hidden` e `[display:grid]` empatam em especificidade; por isso o display não vem de `rotulo`.
const rotuloFiltro = computed(() => `gap-1 text-[length:var(--fs-label)] font-semibold ${filtrosAbertos.value ? '[display:grid]' : 'hidden md:[display:grid]'}`)
const card = 'rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-[0_1px_2px_rgba(20,22,26,0.05)]'
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-bold">Imóveis</h1>
        <p class="mt-1 text-[var(--ink-soft)]">O que você cadastra aqui é o que aparece no site da imobiliária.</p>
      </div>
      <NuxtLink v-if="podeCriar" to="/gestao/imoveis/novo" class="inline-flex min-h-11 items-center rounded-[10px] bg-[var(--gestao-amarelo)] px-5 font-bold text-[var(--brand)] no-underline hover:opacity-90" data-testid="imovel-novo">
        Cadastrar imóvel
      </NuxtLink>
    </header>

    <div :class="card" class="[display:grid] gap-3 p-4 md:grid-cols-[1fr_10rem_10rem_10rem] md:p-5">
      <div class="flex items-end gap-2">
        <label :class="rotulo" class="min-w-0 flex-1">Buscar
          <input v-model="filtro.busca" :class="campo" type="search" autocomplete="off" placeholder="Título, bairro ou proprietário" data-testid="imovel-busca" />
        </label>
        <!-- Só no celular: os três selects ficam atrás deste botão para a lista não cair abaixo da dobra. -->
        <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)] md:hidden" :aria-expanded="filtrosAbertos" data-testid="imovel-filtros-botao" @click="filtrosAbertos = !filtrosAbertos">
          Filtros<span v-if="filtrosAtivos"> ({{ filtrosAtivos }})</span>
        </button>
      </div>
      <label :class="rotuloFiltro">Anúncio
        <select v-model="filtro.status" :class="campo" data-testid="imovel-filtro-status">
          <option value="">Todos</option>
          <option v-for="s in STATUS_IMOVEL" :key="s" :value="s">{{ ROTULO_STATUS_IMOVEL[s] }}</option>
        </select>
      </label>
      <label :class="rotuloFiltro">Situação
        <select v-model="filtro.situacao" :class="campo" data-testid="imovel-filtro-situacao">
          <option value="">Todas</option>
          <option v-for="(r, k) in ROTULO_SITUACAO_IMOVEL" :key="k" :value="k">{{ r }}</option>
        </select>
      </label>
      <label :class="rotuloFiltro">Finalidade
        <select v-model="filtro.purpose" :class="campo" data-testid="imovel-filtro-finalidade">
          <option value="">Todas</option>
          <option v-for="(r, k) in ROTULO_FINALIDADE" :key="k" :value="k">{{ r }}</option>
        </select>
      </label>
    </div>

    <p v-if="!lista.length" class="m-0 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink-soft)]" data-testid="imovel-vazio">
      Nenhum imóvel encontrado com esse filtro.
      <button v-if="filtrosAtivos || filtro.busca" type="button" class="ml-2 min-h-11 cursor-pointer border-0 bg-transparent font-bold text-[var(--brand)] underline" data-testid="imovel-limpar-filtros" @click="Object.assign(filtro, FILTRO_IMOVEIS_VAZIO)">Limpar filtros</button>
    </p>
    <ul v-else class="m-0 list-none [display:grid] gap-3 p-0 md:grid-cols-2" data-testid="imovel-lista">
      <li v-for="i in lista" :key="i.id" :class="card" class="overflow-hidden" data-testid="imovel-card">
        <NuxtLink :to="`/gestao/imoveis/${i.id}`" class="flex gap-3 p-3 text-inherit no-underline hover:bg-[var(--paper-2)]">
          <img v-if="capa(i.images)" :src="capa(i.images)!" :alt="`Capa de ${i.title}`" class="size-24 shrink-0 rounded-lg object-cover" />
          <span v-else class="flex size-24 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--line-2)]" role="img" aria-label="Sem foto">
            <svg class="size-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 3l9 8M5 10v10h14V10M10 20v-5h4v5" /></svg>
          </span>
          <span class="flex min-w-0 flex-col gap-1">
            <strong class="truncate text-[length:var(--fs-body)]">{{ i.title }}</strong>
            <span class="text-[var(--ink-soft)]">{{ i.neighborhood }} · {{ rotuloTipoImovel(i.type) }} · {{ ROTULO_FINALIDADE[i.purpose] }}</span>
            <span class="font-bold">{{ preco(i.price, i.purpose) }}</span>
            <span class="flex flex-wrap gap-1.5 text-[length:var(--fs-caption)] font-bold">
              <span class="rounded-full bg-[var(--paper-2)] px-2.5 py-1" data-testid="imovel-status-selo">{{ ROTULO_STATUS_IMOVEL[i.status] }}</span>
              <span
                class="rounded-full px-2.5 py-1"
                :class="TOM_SITUACAO[situacaoImovel(i.id, store.locacoes.value, store.processos.value)]"
                data-testid="imovel-situacao"
              >{{ ROTULO_SITUACAO_IMOVEL[situacaoImovel(i.id, store.locacoes.value, store.processos.value)] }}</span>
            </span>
            <span v-if="nomeCorretor(i.brokerId) !== '—'" class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">Corretor: {{ nomeCorretor(i.brokerId) }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
