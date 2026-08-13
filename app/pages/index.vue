<script setup lang="ts">
import type { Property } from '~~/shared/models/property'
import { createCatalogFilters } from '~/composables/useCatalog'

const tenant = useTenant()
const requestFetch = useRequestFetch()
const requestUrl = useRequestURL()

const { data: properties } = await useAsyncData('properties', () => requestFetch<Property[]>('/api/properties'), {
  default: () => [] as Property[],
  getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
})

const list = computed(() => properties.value ?? [])
const filters = reactive(createCatalogFilters())
const { filtered, reset } = useCatalog(list, filters)

const selected = ref<Property | null>(null)
const resultsEl = ref<HTMLElement | null>(null)
function scrollToResults() {
  resultsEl.value?.scrollIntoView({ behavior: 'smooth' })
}

const heroTitle = computed(() => tenant.value?.heroTitle || 'Encontre o imóvel certo sem rodeios.')

useSeoMeta({
  title: () => tenant.value?.heroTitle || 'Imóveis à venda e para alugar',
  ogTitle: () => `${tenant.value?.name || 'Imóveis'} · Imóveis à venda e para alugar`,
})

const sameAs = computed(() =>
  [tenant.value?.instagram, tenant.value?.website].filter(Boolean) as string[],
)

const orgJsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  '@id': requestUrl.origin,
  name: tenant.value?.name,
  alternateName: tenant.value?.alternateNames?.length ? tenant.value.alternateNames : undefined,
  description: tenant.value?.heroSubtitle,
  telephone: tenant.value?.phone || undefined,
  email: tenant.value?.email || undefined,
  areaServed: tenant.value?.city || undefined,
  url: requestUrl.origin,
  logo: tenant.value?.logoUrl || undefined,
  image: tenant.value?.logoUrl || undefined,
  sameAs: sameAs.value.length ? sameAs.value : undefined,
  address: tenant.value?.city
    ? {
        '@type': 'PostalAddress',
        addressLocality: tenant.value?.city,
        addressRegion: tenant.value?.state || undefined,
        addressCountry: 'BR',
      }
    : undefined,
}))

useHead(() => ({
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(orgJsonLd.value) }],
}))
</script>

<template>
  <div>
    <section class="hero">
      <div class="hero-in">
        <span v-if="tenant?.tagline" class="eyebrow"><span class="dot" />{{ tenant.tagline }}</span>
        <h1>{{ heroTitle }}</h1>
        <p v-if="tenant?.heroSubtitle" class="sub">{{ tenant.heroSubtitle }}</p>
      </div>
    </section>

    <div class="search">
      <PropertySearch :filters="filters" @search="scrollToResults" />
    </div>

    <main ref="resultsEl" class="wrap">
      <div class="res-head">
        <div>
          <h2>{{ filters.purpose === 'aluguel' ? 'Imóveis para alugar' : 'Imóveis à venda' }}</h2>
          <div class="count">
            {{ filtered.length }} {{ filtered.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados' }}
          </div>
        </div>
        <div class="sort">
          Ordenar
          <select v-model="filters.sort" aria-label="Ordenar imóveis">
            <option value="rel">Relevância</option>
            <option value="menor">Menor preço</option>
            <option value="maior">Maior preço</option>
            <option value="area">Maior área</option>
          </select>
        </div>
      </div>

      <TypeChips :filters="filters" />

      <div v-if="filtered.length" class="grid">
        <PropertyCard
          v-for="(p, i) in filtered"
          :key="p.id"
          :property="p"
          :style="`animation: fade .4s ease ${i * 0.04}s both`"
          @open="selected = $event"
        />
      </div>

      <div v-else class="empty">
        <AppIcon name="home" />
        <h3>Nenhum imóvel com esses filtros</h3>
        <p>Tente ampliar a faixa de valor ou remover algum filtro.</p>
        <button @click="reset()">Limpar filtros</button>
      </div>
    </main>

    <PropertyModal :property="selected" @close="selected = null" />
  </div>
</template>
