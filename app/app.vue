<script setup lang="ts">
import type { Tenant } from '~~/shared/models/tenant'

const tenantState = useTenant()
const requestFetch = useRequestFetch()

// Carrega o tenant uma única vez (SSR) e reaproveita o payload no client.
// useRequestFetch encaminha o header Host (essencial p/ resolver o tenant no SSR).
const { data } = await useAsyncData('tenant', () => requestFetch<Tenant>('/api/tenant'), {
  getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
})
if (data.value) tenantState.value = data.value
watch(data, (v) => {
  if (v) tenantState.value = v
})

const config = useRuntimeConfig()

// Injeta as cores da marca do tenant como CSS vars (tema por tenant).
useHead(() => ({
  style: tenantState.value
    ? [
        {
          id: 'tenant-theme',
          innerHTML: `:root{--brand:${tenantState.value.brandPrimary};--accent:${tenantState.value.brandAccent};}`,
        },
      ]
    : [],
  meta: [{ name: 'theme-color', content: tenantState.value?.brandPrimary || '#0f3d38' }],
}))

useHead({
  titleTemplate: (title?: string) =>
    title ? `${title} · ${tenantState.value?.name || 'Imóveis'}` : tenantState.value?.name || 'Imóveis',
})

useSeoMeta({
  description: () =>
    tenantState.value?.heroSubtitle ||
    'Casas, apartamentos e terrenos à venda e para alugar. Fale direto com o corretor.',
  ogType: 'website',
  ogSiteName: () => tenantState.value?.name || 'Imóveis',
  ogTitle: () => tenantState.value?.name || 'Imóveis',
  ogDescription: () =>
    tenantState.value?.heroSubtitle || 'Encontre o imóvel certo e fale direto com o corretor.',
  ogLocale: 'pt_BR',
  twitterCard: 'summary_large_image',
})

useHead({
  link: [{ rel: 'canonical', href: config.public.siteUrl }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
