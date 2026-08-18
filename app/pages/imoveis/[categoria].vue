<script setup lang="ts">
import type { PropertyCard } from '~~/shared/models/property'
import { createCatalogFilters } from '~/composables/useCatalog'
import {
  parseCategorySlug,
  categoryLabel,
  categorySlug,
  CATEGORY_MIN_PROPERTIES,
} from '~~/shared/utils/category'

const route = useRoute()
const tenant = useTenant()
const requestFetch = useRequestFetch()
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true })

const category = parseCategorySlug(String(route.params.categoria))
if (!category) {
  throw createError({ statusCode: 404, statusMessage: 'Categoria não encontrada.' })
}

// Mesma chave da home: navegar home <-> categoria não refaz requisição, e o
// payload SSR não é duplicado.
const { data: properties } = await useAsyncData(
  'properties',
  () => requestFetch<PropertyCard[]>('/api/properties'),
  {
    default: () => [] as PropertyCard[],
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  },
)

const inCategory = computed(() =>
  (properties.value ?? []).filter((p) => p.type === category.type && p.purpose === category.purpose),
)

// Piso de conteúdo: categoria magra não vira página. Evita publicar dezenas de
// rotas quase vazias, que o Google trata como conteúdo fino gerado em massa.
if (inCategory.value.length < CATEGORY_MIN_PROPERTIES) {
  throw createError({ statusCode: 404, statusMessage: 'Categoria sem imóveis suficientes.' })
}

// Tipo e pretensão já vêm da própria rota; os demais filtros seguem em memória,
// como na home — instantâneos e sem requisição.
const filters = reactive(createCatalogFilters())
filters.purpose = category.purpose
const { filtered } = useCatalog(inCategory, filters)

const cityLabel = computed(() => (tenant.value?.city ? ` em ${tenant.value.city}` : ''))
const heading = computed(() => `${categoryLabel(category)}${cityLabel.value}`)

/** Bairros presentes nesta categoria — viram atalhos de filtro (não rotas próprias). */
const neighborhoods = computed(() => {
  const counts = new Map<string, number>()
  for (const p of inCategory.value) {
    if (p.neighborhood) counts.set(p.neighborhood, (counts.get(p.neighborhood) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
})

const canonical = `${url.origin}/imoveis/${categorySlug(category)}`

useSeoMeta({
  title: () => heading.value,
  description: () =>
    `${heading.value}: ${inCategory.value.length} ${inCategory.value.length === 1 ? 'opção' : 'opções'} disponíveis` +
    `${tenant.value?.name ? ' na ' + tenant.value.name : ''}. Veja fotos, valores e fale direto com o corretor.`,
  ogTitle: () => `${heading.value}${tenant.value?.name ? ' · ' + tenant.value.name : ''}`,
  ogType: 'website',
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonical }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: url.origin + '/' },
          { '@type': 'ListItem', position: 2, name: heading.value, item: canonical },
        ],
      }),
    },
  ],
}))
</script>

<template>
  <div>
    <div class="cat-head">
      <nav class="crumbs" aria-label="Trilha de navegação">
        <NuxtLink to="/">Início</NuxtLink>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{{ heading }}</span>
      </nav>

      <h1>{{ heading }}</h1>
      <p class="cat-intro">
        {{ inCategory.length }}
        {{ inCategory.length === 1 ? 'imóvel disponível' : 'imóveis disponíveis' }}
        <template v-if="tenant?.name">na {{ tenant.name }}</template
        >. Compare fotos, valores e características, e fale direto com o corretor pelo WhatsApp.
      </p>

      <div v-if="neighborhoods.length > 1" class="cat-hoods">
        <span class="cat-hoods-label">Bairros:</span>
        <button
          class="hood"
          :class="{ on: !filters.q }"
          @click="filters.q = ''"
        >
          Todos
        </button>
        <button
          v-for="[name, count] in neighborhoods"
          :key="name"
          class="hood"
          :class="{ on: filters.q === name }"
          @click="filters.q = filters.q === name ? '' : name"
        >
          {{ name }} <small>{{ count }}</small>
        </button>
      </div>
    </div>

    <main class="wrap">
      <div v-if="filtered.length" class="grid">
        <PropertyCard
          v-for="(p, i) in filtered"
          :key="p.id"
          :property="p"
          :index="i"
          :style="`animation: fade .4s ease ${Math.min(i, 8) * 0.04}s both`"
        />
      </div>
      <div v-else class="empty">
        <AppIcon name="home" />
        <h3>Nenhum imóvel nesse bairro</h3>
        <button @click="filters.q = ''">Ver todos</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.cat-head {
  max-width: 1140px;
  margin: 0 auto;
  padding: 28px 18px 0;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-soft);
  margin-bottom: 12px;
}
.crumbs a {
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}
.crumbs a:hover {
  text-decoration: underline;
}
.cat-head h1 {
  font-size: clamp(26px, 4.5vw, 38px);
  margin: 0 0 10px;
}
.cat-intro {
  color: var(--ink-soft);
  font-size: 16px;
  max-width: 62ch;
  margin: 0;
}
.cat-hoods {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.cat-hoods-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-soft);
}
.hood {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  background: var(--paper);
  border: 1.5px solid var(--line-2);
  border-radius: 100px;
  padding: 7px 13px;
}
.hood small {
  color: var(--ink-soft);
  font-weight: 500;
}
.hood.on {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.hood.on small {
  color: rgba(255, 255, 255, 0.75);
}
</style>
