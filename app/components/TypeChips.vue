<script setup lang="ts">
import type { CatalogFilters } from '~/composables/useCatalog'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

defineProps<{ filters: CatalogFilters }>()
</script>

<template>
  <div class="chips">
    <button class="chip" :class="{ on: filters.type === '' }" @click="filters.type = ''">Todos</button>
    <button
      v-for="t in PROPERTY_TYPES"
      :key="t"
      class="chip"
      :class="{ on: filters.type === t }"
      @click="filters.type = t"
    >
      {{ PROPERTY_TYPE_LABELS[t] }}
    </button>
  </div>
</template>
