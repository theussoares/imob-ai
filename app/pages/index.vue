<script setup lang="ts">
import type { PropertyCard } from "~~/shared/models/property";
import { createCatalogFilters } from "~/composables/useCatalog";

const tenant = useTenant();
const requestFetch = useRequestFetch();
const requestUrl = useRequestURL();

// Domínio-raiz da plataforma -> landing da Moradi (sem catálogo/tenant).
const platformRoot = useState("platformRoot", () => false);
if (platformRoot.value) setPageLayout("landing");

const { data: properties } = await useAsyncData(
  "properties",
  () =>
    platformRoot.value
      ? Promise.resolve([] as PropertyCard[])
      : requestFetch<PropertyCard[]>("/api/properties"),
  {
    default: () => [] as PropertyCard[],
    getCachedData: (key, nuxtApp) =>
      nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  },
);

const list = computed(() => properties.value ?? []);
// useState (não reactive local): sobrevive à navegação SPA (voltar do /imovel/[code]
// mantém filtro), mas reseta num reload de verdade — e é seguro em SSR (isolado por
// requisição, ao contrário de um objeto solto no escopo do módulo).
const filters = useState("catalog-filters", createCatalogFilters).value;
const { filtered, reset } = useCatalog(list, filters);

// A pretensão é a única parte do filtro que vive na URL (/?purpose=aluguel), pra
// que a listagem de locação seja indexável e os imóveis de aluguel tenham link
// interno. Os demais filtros seguem em memória (instantâneos, sem requisição).
const route = useRoute();
const isRent = computed(() => route.query.purpose === "aluguel");
watchEffect(() => {
  const next = isRent.value ? "aluguel" : "venda";
  if (filters.purpose !== next) {
    filters.purpose = next;
    filters.maxPrice = 0; // faixas de preço de venda e aluguel não são comparáveis
  }
});

const resultsEl = ref<HTMLElement | null>(null);
function scrollToResults() {
  resultsEl.value?.scrollIntoView({ behavior: "smooth" });
}

// Título/descrição distintos por pretensão: /?purpose=aluguel é uma página
// própria, não pode competir com a home como conteúdo duplicado.
useSeoMeta({
  title: () =>
    isRent.value
      ? `Imóveis para alugar${tenant.value?.city ? " em " + tenant.value.city : ""}`
      : tenant.value?.heroTitle || "Imóveis à venda e para alugar",
  description: () =>
    isRent.value
      ? `Casas, apartamentos e terrenos para alugar${tenant.value?.city ? " em " + tenant.value.city : ""}. Fale direto com o corretor.`
      : undefined,
  ogTitle: () =>
    `${tenant.value?.name || "Imóveis"} · ${isRent.value ? "Imóveis para alugar" : "Imóveis à venda e para alugar"}`,
});

// Canonical precisa carregar a query — o global do app.vue usa só route.path, e
// sem isto /?purpose=aluguel se canonicalizaria para a home de venda.
useHead(() => ({
  link: [
    {
      rel: "canonical",
      href: requestUrl.origin + route.path + (isRent.value ? "?purpose=aluguel" : ""),
    },
  ],
}));

const sameAs = computed(
  () =>
    [tenant.value?.instagram, tenant.value?.website].filter(
      Boolean,
    ) as string[],
);

const orgJsonLd = computed(() => ({
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "@id": requestUrl.origin,
  name: tenant.value?.name,
  alternateName: tenant.value?.alternateNames?.length
    ? tenant.value.alternateNames
    : undefined,
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
        "@type": "PostalAddress",
        addressLocality: tenant.value?.city,
        addressRegion: tenant.value?.state || undefined,
        addressCountry: "BR",
      }
    : undefined,
}));

useHead(() => ({
  script: platformRoot.value
    ? []
    : [
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify(orgJsonLd.value),
        },
      ],
}));
</script>

<template>
  <MoradiLanding v-if="platformRoot" />
  <div v-else>
    <Hero :tenant="tenant" />

    <div class="search">
      <PropertySearch :filters="filters" @search="scrollToResults" />
    </div>

    <main ref="resultsEl" class="wrap">
      <div class="res-head">
        <div>
          <h2>
            {{
              filters.purpose === "aluguel"
                ? "Imóveis para alugar"
                : "Imóveis à venda"
            }}
          </h2>
          <div class="count">
            {{ filtered.length }}
            {{
              filtered.length === 1
                ? "imóvel encontrado"
                : "imóveis encontrados"
            }}
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
        <!-- stagger limitado a 8 cards: sem o teto, 50 imóveis deixam o último
             invisível por ~2s (e 200 imóveis, por 8s) por causa do fill-mode both. -->
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
        <h3>Nenhum imóvel com esses filtros</h3>
        <p>Tente ampliar a faixa de valor ou remover algum filtro.</p>
        <button @click="reset()">Limpar filtros</button>
      </div>
    </main>
  </div>
</template>
