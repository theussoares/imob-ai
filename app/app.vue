<script setup lang="ts">
import type { Tenant } from '~~/shared/models/tenant'

type TenantResponse = Tenant | { platformRoot: true }

const tenantState = useTenant()
const platformRoot = useState('platformRoot', () => false)
const requestFetch = useRequestFetch()

// Carrega o tenant uma única vez (SSR) e reaproveita o payload no client.
// useRequestFetch encaminha o header Host (essencial p/ resolver o tenant no SSR).
const { data } = await useAsyncData('tenant', () => requestFetch<TenantResponse>('/api/tenant'), {
  getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
})
function applyTenant(v: TenantResponse | null) {
  if (!v) return
  if ('platformRoot' in v) {
    platformRoot.value = true
    tenantState.value = null
  } else {
    tenantState.value = v
    platformRoot.value = false
  }
}
applyTenant(data.value ?? null)
watch(data, (v) => applyTenant(v ?? null))

const config = useRuntimeConfig()

// Injeta as cores da marca do tenant como CSS vars (tema por tenant).
useHead(() => ({
  style: tenantState.value
    ? [
        {
          id: 'tenant-theme',
          // especificidade de `:root` sozinho (0,1,0) empata com a do main.css — quem
          // vem depois no <head> vence, e essa ordem não é garantida. `html:root`
          // (0,1,1) sempre bate o main.css, não importa a ordem de injeção.
          innerHTML: `html:root{--brand:${tenantState.value.brandPrimary};--accent:${tenantState.value.brandAccent};}`,
        },
      ]
    : [],
  meta: [{ name: 'theme-color', content: tenantState.value?.brandPrimary || '#0f3d38' }],
}))

useHead({
  titleTemplate: (title?: string) => {
    const base = platformRoot.value ? 'Moradi' : tenantState.value?.name || 'Imóveis'
    return title ? `${title} · ${base}` : base
  },
})

// Canonical/URL por HOST (multitenant): cada tenant se auto-canonicaliza no
// próprio domínio, em vez de um domínio único global.
const requestUrl = useRequestURL()
const route = useRoute()
const canonicalUrl = computed(() => `${requestUrl.origin}${route.path}`)

useSeoMeta({
  description: () =>
    tenantState.value?.heroSubtitle ||
    'Casas, apartamentos e terrenos à venda e para alugar. Fale direto com o corretor.',
  ogType: 'website',
  ogSiteName: () => tenantState.value?.name || 'Imóveis',
  ogTitle: () => tenantState.value?.name || 'Imóveis',
  ogDescription: () =>
    tenantState.value?.heroSubtitle || 'Encontre o imóvel certo e fale direto com o corretor.',
  ogUrl: () => canonicalUrl.value,
  ogLocale: 'pt_BR',
  twitterCard: 'summary_large_image',
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
