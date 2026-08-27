<script setup lang="ts">
import type { CatalogFilters } from '~/composables/useCatalog'
import type { PropertyCard, PropertyType } from '~~/shared/models/property'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

const props = defineProps<{ filters: CatalogFilters; properties?: PropertyCard[] }>()

/**
 * Só os tipos que esta imobiliária realmente tem, na pretensão que está na tela.
 *
 * O registro de tipos tem doze entradas e cresce a cada cliente novo. Renderizar
 * todas dava uma parede de doze pastilhas em que a maioria levava a "Nenhum
 * imóvel com esses filtros" — um filtro que promete resultado e entrega vazio
 * ensina a pessoa a não confiar nos filtros.
 *
 * Filtrar por `purpose` junto importa: quem está em "Alugar" numa imobiliária
 * com um sobrado para alugar e trinta casas à venda não deveria ver a pastilha
 * "Casa" ali.
 *
 * `properties` é opcional para que a lista completa continue sendo o padrão
 * quando o chamador não tem o catálogo em mãos — nenhuma tela fica sem filtro
 * por esquecimento de passar a prop.
 */
const tipos = computed<PropertyType[]>(() => {
  const list = props.properties
  if (!list?.length) return PROPERTY_TYPES

  const presentes = new Set(
    list.filter((p) => p.purpose === props.filters.purpose).map((p) => p.type),
  )
  // O tipo selecionado no momento não pode sumir da lista: ele desapareceria
  // debaixo do dedo da pessoa e não haveria como voltar atrás.
  if (props.filters.type) presentes.add(props.filters.type)

  return PROPERTY_TYPES.filter((t) => presentes.has(t))
})

// Uma pastilha só ("Todos" + o único tipo existente) não filtra nada.
const mostrar = computed(() => tipos.value.length > 1)
</script>

<template>
  <div v-if="mostrar" class="chips">
    <button class="chip" :class="{ on: filters.type === '' }" @click="filters.type = ''">
      Todos
    </button>
    <button
      v-for="t in tipos"
      :key="t"
      class="chip"
      :class="{ on: filters.type === t }"
      :aria-pressed="filters.type === t"
      @click="filters.type = t"
    >
      {{ PROPERTY_TYPE_LABELS[t] }}
    </button>
  </div>
</template>
