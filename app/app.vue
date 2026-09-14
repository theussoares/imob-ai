<script setup lang="ts">
import type { Tenant } from '~~/shared/models/tenant'
import { homeOgUrl } from '~~/shared/utils/og-image'

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
          //
          // --wa só entra quando o tenant define uma cor própria: a maioria não
          // mexe nisso, e sem essa declaração o valor fixo do main.css (verde
          // padrão do WhatsApp) continua valendo — --wa-dark (hover) deriva dele
          // via color-mix, então não precisa ser injetado à parte.
          innerHTML: `html:root{--brand:${tenantState.value.brandPrimary};--accent:${tenantState.value.brandAccent};${tenantState.value.whatsappButtonColor ? `--wa:${tenantState.value.whatsappButtonColor};` : ''}}`,
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

// Card social padrão de TODA página. Antes só a home e o detalhe do imóvel
// anunciavam imagem — categorias, bairros e /quero-vender iam sem nenhuma, e o
// WhatsApp caía no favicon do site. Quem tem imagem própria (o detalhe do
// imóvel) sobrescreve estas tags.
//
// A versão (`?v=`) sai do hero/logo porque é o que o app.vue conhece sem buscar
// nada. Quando o card acaba vindo da capa de um imóvel (tenant sem hero e sem
// logo), trocar essa foto não muda a URL — o preview velho só cai quando o cache
// do WhatsApp expira sozinho. Aceito: é o caso raro, e a alternativa era carregar
// a lista de imóveis em toda página só para calcular um hash.
useOgCard(() => ({
  url: homeOgUrl(requestUrl.origin, tenantState.value?.heroImage || tenantState.value?.logoUrl),
  alt: tenantState.value?.name || undefined,
}))

useHead(() => ({
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
    // Ícone cadastrado no painel tem prioridade; sem ele, o gerado por tenant em
    // server/routes/favicon.svg.get.ts (inicial + cor da marca). Nenhum dos dois
    // é arquivo estático porque precisam variar por host.
    //
    // Sem `type` no caso do upload: o arquivo pode ser png ou webp, e declarar o
    // tipo errado faz o navegador descartar o ícone.
    tenantState.value?.faviconUrl
      ? { rel: 'icon', href: tenantState.value.faviconUrl }
      : { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
  ],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
