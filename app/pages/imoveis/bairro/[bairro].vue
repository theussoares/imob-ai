<script setup lang="ts">
import type { PropertyCard } from "~~/shared/models/property";
import {
  findNeighborhood,
  propertiesInNeighborhood,
} from "~~/shared/utils/neighborhood";

const route = useRoute();
const tenant = useTenant();
const requestFetch = useRequestFetch();
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true });

// Mesma chave da home e da categoria: navegar entre elas não refaz a
// requisição, e o payload SSR não é duplicado.
const { data: properties } = await useAsyncData(
  "properties",
  () => requestFetch<PropertyCard[]>("/api/properties"),
  {
    default: () => [] as PropertyCard[],
    getCachedData: (key, nuxtApp) =>
      nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  },
);

const bairroSlug = String(route.params.bairro);
// O piso de conteúdo (mesmo das categorias) já está embutido aqui: um bairro
// com menos de 3 imóveis não resolve, e a rota responde 404 — nunca há link
// pra essas páginas (ver `hoodLinks` na home), então 404 não aparece pra
// ninguém que navegue pelo site.
const neighborhood = computed(() =>
  findNeighborhood(properties.value ?? [], bairroSlug),
);
if (!neighborhood.value) {
  throw createError({ statusCode: 404, statusMessage: "Bairro não encontrado." });
}

const inNeighborhood = computed(() =>
  propertiesInNeighborhood(properties.value ?? [], bairroSlug),
);

const { whatsappLink } = useContact();

const cityLabel = computed(() => (tenant.value?.city ? `, ${tenant.value.city}` : ""));
const heading = computed(() => `Imóveis em ${neighborhood.value?.label}${cityLabel.value}`);

const canonical = `${url.origin}/imoveis/bairro/${bairroSlug}`;

useSeoMeta({
  title: () => heading.value,
  description: () =>
    `${heading.value}: ${inNeighborhood.value.length} ${inNeighborhood.value.length === 1 ? "opção" : "opções"} disponíveis` +
    `${tenant.value?.name ? " na " + tenant.value.name : ""}. Veja fotos, valores e fale direto com o corretor.`,
  ogTitle: () => `${heading.value}${tenant.value?.name ? " · " + tenant.value.name : ""}`,
  ogType: "website",
});

useHead(() => ({
  link: [{ rel: "canonical", href: canonical }],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: url.origin + "/" },
          { "@type": "ListItem", position: 2, name: heading.value, item: canonical },
        ],
      }),
    },
  ],
}));
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
        {{ inNeighborhood.length }}
        {{ inNeighborhood.length === 1 ? "imóvel disponível" : "imóveis disponíveis" }}
        <template v-if="tenant?.name">na {{ tenant.name }}</template
        >. Compare fotos, valores e características, e fale direto com o corretor pelo WhatsApp.
      </p>
    </div>

    <main class="wrap">
      <div class="grid">
        <PropertyCard
          v-for="(p, i) in inNeighborhood"
          :key="p.id"
          :property="p"
          :index="i"
          :style="`animation: fade .4s ease ${Math.min(i, 8) * 0.04}s both`"
        />
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
</style>
