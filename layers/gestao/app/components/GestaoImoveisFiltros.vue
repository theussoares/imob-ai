<script setup lang="ts">
import { ROTULO_FINALIDADE, ROTULO_SITUACAO_IMOVEL, ROTULO_STATUS_IMOVEL, STATUS_IMOVEL } from '../../domain/imoveis'
import type { FiltroListaImoveis } from '../../domain/imoveis-lista'

// Dumb: a URL é de quem usa (`useListaPaginada`). A busca é v-model; os selects emitem só o que mudou.
const props = defineProps<{ filtro: FiltroListaImoveis }>()
const q = defineModel<string>('q', { required: true })
const emit = defineEmits<{ mudar: [parcial: Partial<FiltroListaImoveis>] }>()

const aoMudar = (campo: 'status' | 'purpose' | 'situacao', e: Event) => emit('mudar', { [campo]: (e.target as HTMLSelectElement).value })

const filtrosAbertos = ref(false)
const ativos = computed(() => [props.filtro.status, props.filtro.situacao, props.filtro.purpose].filter(Boolean).length)
const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
// `hidden` e `[display:grid]` empatam em especificidade; por isso o display não vem de `rotulo`.
const rotuloFiltro = computed(() => `gap-1 text-[length:var(--fs-label)] font-semibold ${filtrosAbertos.value ? '[display:grid]' : 'hidden md:[display:grid]'}`)
</script>

<template>
  <div class="[display:grid] gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_1px_2px_rgba(20,22,26,0.05)] md:grid-cols-[1fr_10rem_10rem_10rem] md:p-5">
    <div class="flex items-end gap-2">
      <label :class="rotulo" class="min-w-0 flex-1">Buscar
        <input v-model="q" :class="campo" type="search" autocomplete="off" placeholder="Título, código, bairro ou proprietário" data-testid="imovel-busca" />
      </label>
      <!-- Só no celular: os três selects ficam atrás deste botão para a lista não cair abaixo da dobra. -->
      <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)] md:hidden" :aria-expanded="filtrosAbertos" data-testid="imovel-filtros-botao" @click="filtrosAbertos = !filtrosAbertos">
        Filtros<span v-if="ativos"> ({{ ativos }})</span>
      </button>
    </div>
    <label :class="rotuloFiltro">Anúncio
      <select :value="props.filtro.status" :class="campo" data-testid="imovel-filtro-status" @change="aoMudar('status', $event)">
        <option value="">Todos</option>
        <option v-for="s in STATUS_IMOVEL" :key="s" :value="s">{{ ROTULO_STATUS_IMOVEL[s] }}</option>
      </select>
    </label>
    <label :class="rotuloFiltro">Situação
      <select :value="props.filtro.situacao" :class="campo" data-testid="imovel-filtro-situacao" @change="aoMudar('situacao', $event)">
        <option value="">Todas</option>
        <option v-for="(r, k) in ROTULO_SITUACAO_IMOVEL" :key="k" :value="k">{{ r }}</option>
      </select>
    </label>
    <label :class="rotuloFiltro">Finalidade
      <select :value="props.filtro.purpose" :class="campo" data-testid="imovel-filtro-finalidade" @change="aoMudar('purpose', $event)">
        <option value="">Todas</option>
        <option v-for="(r, k) in ROTULO_FINALIDADE" :key="k" :value="k">{{ r }}</option>
      </select>
    </label>
  </div>
</template>
