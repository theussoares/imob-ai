<script setup lang="ts">
import type { CatalogFilters } from '~/composables/useCatalog'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

const props = defineProps<{ filters: CatalogFilters }>()
const emit = defineEmits<{ search: [] }>()

/**
 * A pretensão canônica vive em `/imoveis/a-venda` e `/imoveis/para-alugar` —
 * são essas páginas que o Google indexa e que recebem link interno (via
 * `catLinks` na home). Aqui na home o toggle é só filtro de tela, em memória:
 * não escreve na URL.
 */
function setPurpose(p: 'venda' | 'aluguel') {
  if (props.filters.purpose === p) return
  props.filters.purpose = p
  props.filters.maxPrice = 0 // faixas de preço de venda e aluguel não são comparáveis
}

const priceOptions = computed(() =>
  props.filters.purpose === 'aluguel'
    ? [
        { v: 0, l: 'Sem limite' },
        { v: 1500, l: 'Até R$ 1.500' },
        { v: 2500, l: 'Até R$ 2.500' },
        { v: 4000, l: 'Até R$ 4.000' },
      ]
    : [
        { v: 0, l: 'Sem limite' },
        { v: 200000, l: 'Até R$ 200 mil' },
        { v: 350000, l: 'Até R$ 350 mil' },
        { v: 500000, l: 'Até R$ 500 mil' },
        { v: 800000, l: 'Até R$ 800 mil' },
      ],
)

</script>

<template>
  <div class="search-card">
    <nav class="seg" aria-label="Pretensão">
      <button
        type="button"
        :class="{ on: filters.purpose === 'venda' }"
        :aria-pressed="filters.purpose === 'venda'"
        @click="setPurpose('venda')"
      >
        Comprar
      </button>
      <button
        type="button"
        :class="{ on: filters.purpose === 'aluguel' }"
        :aria-pressed="filters.purpose === 'aluguel'"
        @click="setPurpose('aluguel')"
      >
        Alugar
      </button>
    </nav>

    <div class="fields">
      <div class="field">
        <label for="q">Bairro, cidade ou palavra-chave</label>
        <input
          id="q"
          v-model="filters.q"
          class="ctl"
          type="search"
          placeholder="Ex.: Jardim Alvorada, Centro..."
          autocomplete="off"
          @keydown.enter="emit('search')"
        />
      </div>
      <div class="field">
        <label for="fTipo">Tipo de imóvel</label>
        <select id="fTipo" v-model="filters.type" class="ctl">
          <option value="">Todos os tipos</option>
          <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">{{ PROPERTY_TYPE_LABELS[t] }}</option>
        </select>
      </div>
      <div class="field">
        <label for="fQuartos">Quartos</label>
        <select id="fQuartos" v-model.number="filters.bedrooms" class="ctl">
          <option :value="0">Qualquer</option>
          <option :value="1">1+</option>
          <option :value="2">2+</option>
          <option :value="3">3+</option>
          <option :value="4">4+</option>
        </select>
      </div>
      <div class="field">
        <label for="fPreco">Valor até</label>
        <select id="fPreco" v-model.number="filters.maxPrice" class="ctl">
          <option v-for="o in priceOptions" :key="o.v" :value="o.v">{{ o.l }}</option>
        </select>
      </div>
    </div>

    <button class="search-go" @click="emit('search')">
      <AppIcon name="search" />
      Buscar imóveis
    </button>
  </div>
</template>
